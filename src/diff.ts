/**
 * This library modifies the diff-patch-match library by Neil Fraser
 * by removing the patch and match functionality and certain advanced
 * options in the diff function. The original license is as follows:
 *
 * ===
 *
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import toArray from 'lodash/toArray'

/**
 * The data structure representing a diff is an array of tuples:
 * [[DiffOp.DIFF_DELETE, 'Hello'], [DiffOp.DIFF_INSERT, 'Goodbye'], [DiffOp.DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
export enum DiffOp {
  DIFF_DELETE = -1,
  DIFF_INSERT = 1,
  DIFF_EQUAL = 0,
}

export type Sequence = Array<String | number>
export type IDiff = [DiffOp, Sequence]
export interface CursorInfo {
  oldRange: { index: number; length: number };
  newRange: { index: number; length: number };
}
type CursorPos = number | CursorInfo

/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {Int|Object} [cursor_pos] Edit position in text1 or object with more info
 * @return {Array} Array of diff tuples.
 */
function diff_main(text1: Sequence, text2: Sequence, cursor_pos?: CursorPos, _fix_unicode: boolean = false): IDiff[] {
  // Check for equality
  if (isSequenceEqual(text1, text2)) {
    if (text1.length > 0) {
      return [[DiffOp.DIFF_EQUAL, text1]]
    }
    return []
  }

  if (cursor_pos != null) {
    var editDiff = find_cursor_edit_diff(text1, text2, cursor_pos)
    if (editDiff && editDiff.length > 0) {
      return editDiff
    }
  }

  // Trim off common prefix (speedup).
  var commonLength = diff_commonPrefix(text1, text2)
  var commonPrefix = text1.slice(0, commonLength)
  text1 = text1.slice(commonLength)
  text2 = text2.slice(commonLength)

  // Trim off common suffix (speedup).
  commonLength = diff_commonSuffix(text1, text2)
  var commonSuffix = text1.slice(text1.length - commonLength)
  text1 = text1.slice(0, text1.length - commonLength)
  text2 = text2.slice(0, text2.length - commonLength)

  // Compute the diff on the middle block.
  var diffs = diff_compute_(text1, text2)

  // Restore the prefix and suffix.
  if (commonPrefix.length > 0) {
    diffs.unshift([DiffOp.DIFF_EQUAL, commonPrefix])
  }
  if (commonSuffix.length > 0) {
    diffs.push([DiffOp.DIFF_EQUAL, commonSuffix])
  }
  diff_cleanupMerge(diffs, _fix_unicode)
  return diffs
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 */
function diff_compute_(text1: Sequence, text2: Sequence): IDiff[] {
  var diffs: IDiff[]

  if (text1.length === 0) {
    // Just add some text (speedup).
    return [[DiffOp.DIFF_INSERT, text2]]
  }

  if (text2.length === 0) {
    // Just delete some text (speedup).
    return [[DiffOp.DIFF_DELETE, text1]]
  }

  var longText = text1.length > text2.length ? text1 : text2
  var shortText = text1.length > text2.length ? text2 : text1
  var i = indexOfSequence(longText, shortText)
  if (i !== -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [
      [DiffOp.DIFF_INSERT, longText.slice(0, i)],
      [DiffOp.DIFF_EQUAL, shortText],
      [DiffOp.DIFF_INSERT, longText.slice(i + shortText.length)]
    ]
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DiffOp.DIFF_DELETE
    }
    return diffs
  }

  if (shortText.length === 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DiffOp.DIFF_DELETE, text1], [DiffOp.DIFF_INSERT, text2]]
  }

  // Check to see if the problem can be split in two.
  var hm = diff_halfMatch_(text1, text2)
  if (hm && hm.length > 0) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0]
    var text1_b = hm[1]
    var text2_a = hm[2]
    var text2_b = hm[3]
    var mid_common = hm[4]
    // Send both pairs off for separate processing.
    var diffs_a = diff_main(text1_a, text2_a)
    var diffs_b = diff_main(text1_b, text2_b)
    // Merge the results.
    return diffs_a.concat([[DiffOp.DIFF_EQUAL, mid_common]], diffs_b)
  }

  return diff_bisect_(text1, text2)
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 * @private
 */
function diff_bisect_(text1: Sequence, text2: Sequence): IDiff[] {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length
  var text2_length = text2.length
  var max_d = Math.ceil((text1_length + text2_length) / 2)
  var v_offset = max_d
  var v_length = 2 * max_d
  var v1 = new Array(v_length)
  var v2 = new Array(v_length)
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1
    v2[x] = -1
  }
  v1[v_offset + 1] = 0
  v2[v_offset + 1] = 0
  var delta = text1_length - text2_length
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 !== 0)
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0
  var k1end = 0
  var k2start = 0
  var k2end = 0
  for (var d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1
      var x1
      if (k1 === -d || (k1 !== d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1]
      } else {
        x1 = v1[k1_offset - 1] + 1
      }
      var y1 = x1 - k1
      while (
        x1 < text1_length && y1 < text2_length &&
        text1[x1] === text2[y1]
      ) {
        x1++
        y1++
      }
      v1[k1_offset] = x1
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2
      } else if (front) {
        var k2_offset = v_offset + delta - k1
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] !== -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset]
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1)
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2
      var x2: number
      if (k2 === -d || (k2 !== d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1]
      } else {
        x2 = v2[k2_offset - 1] + 1
      }
      var y2 = x2 - k2
      while (
        x2 < text1_length && y2 < text2_length &&
        text1[text1_length - x2 - 1] === text2[text2_length - y2 - 1]
      ) {
        x2++
        y2++
      }
      v2[k2_offset] = x2
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2
      } else if (!front) {
        var k1_offset = v_offset + delta - k2
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] !== -1) {
          var x1 = v1[k1_offset]
          var y1 = v_offset + x1 - k1_offset
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1)
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DiffOp.DIFF_DELETE, text1], [DiffOp.DIFF_INSERT, text2]]
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recursive.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @return {Array} Array of diff tuples.
 */
function diff_bisectSplit_(text1: Sequence, text2: Sequence, x: number, y: number): IDiff[] {
  var text1a = text1.slice(0, x)
  var text2a = text2.slice(0, y)
  var text1b = text1.slice(x)
  var text2b = text2.slice(y)

  // Compute both diffs serially.
  var diffs = diff_main(text1a, text2a)
  var diffsB = diff_main(text1b, text2b)

  return diffs.concat(diffsB)
};


/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
function diff_commonPrefix(text1: Sequence, text2: Sequence): number {
  // Quick check for common null cases.
  if (text1.length === 0 || text2.length === 0 || text1[0] !== text2[0]) {
    return 0
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointerMin = 0
  var pointerMax = Math.min(text1.length, text2.length)
  var pointerMid = pointerMax
  var pointerStart = 0
  while (pointerMin < pointerMid) {
    if (
      isSequenceEqual(
        text1.slice(pointerStart, pointerMid),
        text2.slice(pointerStart, pointerMid)
      )
    ) {
      pointerMin = pointerMid
      pointerStart = pointerMin
    } else {
      pointerMax = pointerMid
    }
    pointerMid = Math.floor((pointerMax - pointerMin) / 2 + pointerMin)
  }

  const seqItem = text1[pointerMid - 1]
  if (typeof seqItem === 'string' && is_surrogate_pair_start(codePointAt(seqItem, 0))) {
    pointerMid--
  }

  return pointerMid
};


/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
function diff_commonSuffix(text1: Sequence, text2: Sequence) {
  // Quick check for common null cases.
  if (text1.length === 0 || text2.length === 0 || !isSequenceEqual(text1.slice(-1), text2.slice(-1))) {
    return 0
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointerMin = 0
  var pointerMax = Math.min(text1.length, text2.length)
  var pointerMid = pointerMax
  var pointerEnd = 0
  while (pointerMin < pointerMid) {
    if (
      isSequenceEqual(
        text1.slice(text1.length - pointerMid, text1.length - pointerEnd),
        text2.slice(text2.length - pointerMid, text2.length - pointerEnd)
      )
    ) {
      pointerMin = pointerMid
      pointerEnd = pointerMin
    } else {
      pointerMax = pointerMid
    }
    pointerMid = Math.floor((pointerMax - pointerMin) / 2 + pointerMin)
  }

  const seqItem = text1[text1.length - pointerMid]
  if (typeof seqItem === 'string' && is_surrogate_pair_end(codePointAt(seqItem, 0))) {
    pointerMid--
  }

  return pointerMid
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
function diff_halfMatch_(text1: Sequence, text2: Sequence) {
  var longText = text1.length > text2.length ? text1 : text2
  var shortText = text1.length > text2.length ? text2 : text1
  if (longText.length < 4 || shortText.length * 2 < longText.length) {
    return null  // Pointless.
  }

  /**
   * Does a substring of shortText exist within longText such that the substring
   * is at least half the length of longText?
   * Closure, but does not reference any external variables.
   * @param {string} longText Longer string.
   * @param {string} shortText Shorter string.
   * @param {number} i Start index of quarter length substring within longText.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longText, the suffix of longText, the prefix of shortText, the suffix
   *     of shortText and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longText: Sequence, shortText: Sequence, i: number): Sequence[] | null {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longText.slice(i, i + Math.floor(longText.length / 4))
    var j = -1
    var best_common: Sequence = []
    let bestLongTextA: Sequence = []
    let bestLongTextB: Sequence = []
    let bestShortTextA: Sequence = []
    let bestShortTextB: Sequence = []
    while ((j = indexOfSequence(shortText, seed, j + 1)) !== -1) {
      var prefixLength = diff_commonPrefix(
        longText.slice(i), shortText.slice(j))
      var suffixLength = diff_commonSuffix(
        longText.slice(0, i), shortText.slice(0, j))
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shortText.slice(j - suffixLength, j).concat(shortText.slice(j, j + prefixLength))
        bestLongTextA = longText.slice(0, i - suffixLength)
        bestLongTextB = longText.slice(i + prefixLength)
        bestShortTextA = shortText.slice(0, j - suffixLength)
        bestShortTextB = shortText.slice(j + prefixLength)
      }
    }
    if (best_common.length * 2 >= longText.length) {
      return [
        bestLongTextA, bestLongTextB,
        bestShortTextA, bestShortTextB, best_common
      ]
    } else {
      return null
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longText, shortText, Math.ceil(longText.length / 4))
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longText, shortText, Math.ceil(longText.length / 2))
  var hm: Sequence[]
  if (!hm1 && !hm2) {
    return null
  } else if (!hm2) {
    hm = hm1 as Sequence[]
  } else if (!hm1) {
    hm = hm2
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b
  if (text1.length > text2.length) {
    text1_a = hm[0]
    text1_b = hm[1]
    text2_a = hm[2]
    text2_b = hm[3]
  } else {
    text2_a = hm[0]
    text2_b = hm[1]
    text1_a = hm[2]
    text1_b = hm[3]
  }
  var mid_common = hm[4]
  return [text1_a, text1_b, text2_a, text2_b, mid_common]
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array} diffs Array of diff tuples.
 * @param {boolean} fix_unicode Whether to normalize to a unicode-correct diff
 */
function diff_cleanupMerge(diffs: IDiff[], fix_unicode: boolean) {
  diffs.push([DiffOp.DIFF_EQUAL, []])  // Add a dummy entry at the end.
  var pointer = 0
  var count_delete = 0
  var count_insert = 0
  var text_delete:Sequence = []
  var text_insert:Sequence = []
  var commonLength
  while (pointer < diffs.length) {
    if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
      diffs.splice(pointer, 1)
      continue
    }
    switch (diffs[pointer][0]) {
      case DiffOp.DIFF_INSERT:

        count_insert++
        text_insert = text_insert.concat(diffs[pointer][1])
        pointer++
        break
      case DiffOp.DIFF_DELETE:
        count_delete++
        text_delete = text_delete.concat(diffs[pointer][1])
        pointer++
        break
      case DiffOp.DIFF_EQUAL:
        var previous_equality = pointer - count_insert - count_delete - 1
        if (fix_unicode) {
          // prevent splitting of unicode surrogate pairs.  when fix_unicode is true,
          // we assume that the old and new text in the diff are complete and correct
          // unicode-encoded JS strings, but the tuple boundaries may fall between
          // surrogate pairs.  we fix this by shaving off stray surrogates from the end
          // of the previous equality and the beginning of this equality.  this may create
          // empty equalities or a common prefix or suffix.  for example, if AB and AC are
          // emojis, `[[0, 'A'], [-1, 'BA'], [0, 'C']]` would turn into deleting 'ABAC' and
          // inserting 'AC', and then the common suffix 'AC' will be eliminated.  in this
          // particular case, both equalities go away, we absorb any previous inequalities,
          // and we keep scanning for the next equality before rewriting the tuples.
          if (previous_equality >= 0 && ends_with_pair_start(diffs[previous_equality][1])) {
            var stray1 = diffs[previous_equality][1].slice(-1)
            diffs[previous_equality][1] = diffs[previous_equality][1].slice(0, -1)
            text_delete = stray1.concat(text_delete)
            text_insert = stray1.concat(text_insert)
            if (diffs[previous_equality][1].length > 0) {
              // emptied out previous equality, so delete it and include previous delete/insert
              diffs.splice(previous_equality, 1)
              pointer--
              var k = previous_equality - 1
              if (diffs[k] && diffs[k][0] === DiffOp.DIFF_INSERT) {
                count_insert++
                text_insert = diffs[k][1].concat(text_insert)
                k--
              }
              if (diffs[k] && diffs[k][0] === DiffOp.DIFF_DELETE) {
                count_delete++
                text_delete = diffs[k][1].concat(text_delete)
                k--
              }
              previous_equality = k
            }
          }
          if (starts_with_pair_end(diffs[pointer][1])) {
            var stray2 = diffs[pointer][1][0]
            diffs[pointer][1] = diffs[pointer][1].slice(1)
            text_delete.push(stray2)
            text_insert.push(stray2)
          }
        }
        if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
          // for empty equality not at end, wait for next equality
          diffs.splice(pointer, 1)
          break
        }
        if (text_delete.length > 0 || text_insert.length > 0) {
          // note that diff_commonPrefix and diff_commonSuffix are unicode-aware
          if (text_delete.length > 0 && text_insert.length > 0) {
            // Factor out any common prefixes.
            commonLength = diff_commonPrefix(text_insert, text_delete)
            if (commonLength !== 0) {
              if (previous_equality >= 0) {
                diffs[previous_equality][1] = diffs[previous_equality][1].concat(text_insert.slice(0, commonLength))
              } else {
                diffs.splice(0, 0, [DiffOp.DIFF_EQUAL, text_insert.slice(0, commonLength)])
                pointer++
              }
              text_insert = text_insert.slice(commonLength)
              text_delete = text_delete.slice(commonLength)
            }
            // Factor out any common suffixes.
            commonLength = diff_commonSuffix(text_insert, text_delete)
            if (commonLength !== 0) {
              diffs[pointer][1] =
                text_insert.slice(text_insert.length - commonLength).concat(diffs[pointer][1])
              text_insert = text_insert.slice(0, text_insert.length - commonLength)
              text_delete = text_delete.slice(0, text_delete.length - commonLength)
            }
          }
          // Delete the offending records and add the merged ones.
          var n = count_insert + count_delete
          if (text_delete.length === 0 && text_insert.length === 0) {
            diffs.splice(pointer - n, n)
            pointer = pointer - n
          } else if (text_delete.length === 0) {
            diffs.splice(pointer - n, n, [DiffOp.DIFF_INSERT, text_insert])
            pointer = pointer - n + 1
          } else if (text_insert.length === 0) {
            diffs.splice(pointer - n, n, [DiffOp.DIFF_DELETE, text_delete])
            pointer = pointer - n + 1
          } else {
            diffs.splice(pointer - n, n, [DiffOp.DIFF_DELETE, text_delete], [DiffOp.DIFF_INSERT, text_insert])
            pointer = pointer - n + 2
          }
        }
        if (pointer !== 0 && diffs[pointer - 1][0] === DiffOp.DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] = diffs[pointer - 1][1].concat(diffs[pointer][1])
          diffs.splice(pointer, 1)
        } else {
          pointer++
        }
        count_insert = 0
        count_delete = 0
        text_delete = []
        text_insert = []
        break
    }
  }
  if (diffs[diffs.length - 1][1].length === 0) {
    diffs.pop()  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false
  pointer = 1
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] === DiffOp.DIFF_EQUAL &&
      diffs[pointer + 1][0] === DiffOp.DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (
        isSequenceEqual(
          diffs[pointer][1].slice(diffs[pointer][1].length - diffs[pointer - 1][1].length),
          diffs[pointer - 1][1]
        )
      ) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1].concat(diffs[pointer][1].slice(0, diffs[pointer][1].length - diffs[pointer - 1][1].length))
        diffs[pointer + 1][1] = diffs[pointer - 1][1].concat(diffs[pointer + 1][1])
        diffs.splice(pointer - 1, 1)
        changes = true
      } else if (isSequenceEqual(diffs[pointer][1].slice(0, diffs[pointer + 1][1].length), diffs[pointer + 1][1])) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] = diffs[pointer - 1][1].concat(diffs[pointer + 1][1])
        diffs[pointer][1] = diffs[pointer][1].slice(diffs[pointer + 1][1].length).concat(diffs[pointer + 1][1])
        diffs.splice(pointer + 1, 1)
        changes = true
      }
    }
    pointer++
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs, fix_unicode)
  }
};

function is_surrogate_pair_start(charCode: number) {
  return charCode >= 0xD800 && charCode <= 0xDBFF
}

function is_surrogate_pair_end(charCode: number) {
  return charCode >= 0xDC00 && charCode <= 0xDFFF
}

function starts_with_pair_end(str: Sequence) {
  const firstItem = str[0]
  return typeof firstItem === 'string' && is_surrogate_pair_end(codePointAt(firstItem, 0))
}

function ends_with_pair_start(str: Sequence) {
  const lastItem = str[str.length - 1]
  return typeof lastItem === 'string' && is_surrogate_pair_start(codePointAt(lastItem, 0))
}

function remove_empty_tuples(tuples: IDiff[]): IDiff[] {
  var ret = []
  for (var i = 0; i < tuples.length; i++) {
    if (tuples[i][1].length > 0) {
      ret.push(tuples[i])
    }
  }
  return ret
}

function make_edit_splice(before: Sequence, oldMiddle: Sequence, newMiddle: Sequence, after: Sequence) {
  if (ends_with_pair_start(before) || starts_with_pair_end(after)) {
    return null
  }
  return remove_empty_tuples([
    [DiffOp.DIFF_EQUAL, before],
    [DiffOp.DIFF_DELETE, oldMiddle],
    [DiffOp.DIFF_INSERT, newMiddle],
    [DiffOp.DIFF_EQUAL, after]
  ])
}

function find_cursor_edit_diff(oldText: Sequence, newText: Sequence, cursor_pos: CursorPos) {
  // note: this runs after equality check has ruled out exact equality
  var oldRange = typeof cursor_pos === 'number' ?
    { index: cursor_pos, length: 0 } : cursor_pos.oldRange
  var newRange = typeof cursor_pos === 'number' ?
    null : cursor_pos.newRange
  // take into account the old and new selection to generate the best diff
  // possible for a text edit.  for example, a text change from "xxx" to "xx"
  // could be a delete or forwards-delete of any one of the x's, or the
  // result of selecting two of the x's and typing "x".
  var oldLength = oldText.length
  var newLength = newText.length
  if (oldRange.length === 0 && (newRange === null || newRange.length === 0)) {
    // see if we have an insert or delete before or after cursor
    var oldCursor = oldRange.index
    var oldBefore = oldText.slice(0, oldCursor)
    var oldAfter = oldText.slice(oldCursor)
    var maybeNewCursor = newRange ? newRange.index : null
    editBefore: {
      // is this an insert or delete right before oldCursor?
      var newCursor = oldCursor + newLength - oldLength
      if (maybeNewCursor !== null && maybeNewCursor !== newCursor) {
        break editBefore
      }
      if (newCursor < 0 || newCursor > newLength) {
        break editBefore
      }
      var newBefore = newText.slice(0, newCursor)
      var newAfter = newText.slice(newCursor)
      if (!isSequenceEqual(newAfter, oldAfter)) {
        break editBefore
      }
      var prefixLength = Math.min(oldCursor, newCursor)
      var oldPrefix = oldBefore.slice(0, prefixLength)
      var newPrefix = newBefore.slice(0, prefixLength)
      if (!isSequenceEqual(oldPrefix, newPrefix)) {
        break editBefore
      }
      var oldMiddle = oldBefore.slice(prefixLength)
      var newMiddle = newBefore.slice(prefixLength)
      return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldAfter)
    }
    editAfter: {
      // is this an insert or delete right after oldCursor?
      if (maybeNewCursor !== null && maybeNewCursor !== oldCursor) {
        break editAfter
      }
      var cursor = oldCursor
      var newBefore = newText.slice(0, cursor)
      var newAfter = newText.slice(cursor)
      if (!isSequenceEqual(newBefore, oldBefore)) {
        break editAfter
      }
      var suffixLength = Math.min(oldLength - cursor, newLength - cursor)
      var oldSuffix = oldAfter.slice(oldAfter.length - suffixLength)
      var newSuffix = newAfter.slice(newAfter.length - suffixLength)
      if (!isSequenceEqual(oldSuffix, newSuffix)) {
        break editAfter
      }
      var oldMiddle = oldAfter.slice(0, oldAfter.length - suffixLength)
      var newMiddle = newAfter.slice(0, newAfter.length - suffixLength)
      return make_edit_splice(oldBefore, oldMiddle, newMiddle, oldSuffix)
    }
  }
  if (oldRange.length > 0 && newRange && newRange.length === 0) {
    replaceRange: {
      // see if diff could be a splice of the old selection range
      var oldPrefix = oldText.slice(0, oldRange.index)
      var oldSuffix = oldText.slice(oldRange.index + oldRange.length)
      var prefixLength = oldPrefix.length
      var suffixLength = oldSuffix.length
      if (newLength < prefixLength + suffixLength) {
        break replaceRange
      }
      var newPrefix = newText.slice(0, prefixLength)
      var newSuffix = newText.slice(newLength - suffixLength)
      if (
        !isSequenceEqual(oldPrefix, newPrefix) ||
        !isSequenceEqual(oldSuffix, newSuffix)
      ) {
        break replaceRange
      }
      var oldMiddle = oldText.slice(prefixLength, oldLength - suffixLength)
      var newMiddle = newText.slice(prefixLength, newLength - suffixLength)
      return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldSuffix)
    }
  }

  return null
}

/**
 * check if two sequences are absolutely equal
 */
function isSequenceEqual(s1: Sequence, s2: Sequence): boolean {
  let res = s1.length === s2.length
  if (res) {
    for (let index = 0; index < s1.length; index++) {
      res = s1[index] === s2[index]
      if (!res) {
        break
      }
    }
  }
  return res
}

/**
 * search position of shortSeq in longSeq
 */
function indexOfSequence(longSeq: Sequence, shortSeq: Sequence, fromIndex = 0): number {
  let res = -1
  for (let longSeqPos = fromIndex, longSeqLength = longSeq.length; longSeqPos < longSeqLength; longSeqPos++) {
    let find = true
    for (let shortSeqPos = 0, shortSeqLength = shortSeq.length; shortSeqPos < shortSeqLength; shortSeqPos++) {
      const longSeqItem = longSeq[longSeqPos + shortSeqPos]
      const shortSeqItem = shortSeq[shortSeqPos]
      if (longSeqItem !== shortSeqItem) {
        find = false
        break
      }
    }
    if (find) {
      res = longSeqPos
      break
    }
  }
  return res
}

function codePointAt(str: string, position: number): number {
  var size = str.length
  // 变成整数
  var index = position ? Number(position) : 0
  if (index != index) { // better `isNaN`
    index = 0
  }
  // 边界
  if (index < 0 || index >= size) {
    throw new Error('out of string size')
  }
  // 第一个编码单元
  var first = str.charCodeAt(index)
  var second
  if ( // 检查是否开始 surrogate pair
    first >= 0xD800 && first <= 0xDBFF && // high surrogate
    size > index + 1 // 下一个编码单元
  ) {
    second = str.charCodeAt(index + 1)
    if (second >= 0xDC00 && second <= 0xDFFF) { // low surrogate
      // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000
    }
  }
  return first
}

export const diff = (text1: string, text2: string, cursor_pos?: CursorPos) => {
  const seq1 = toArray(text1)
  const seq2 = toArray(text2)
  const diffs = diffSequence(seq1, seq2, cursor_pos)
  const res = new Array(diffs.length)
  for (let index = 0; index < diffs.length; index++) {
    const diff = diffs[index];
    res[index] = [diff[0], diff[1].join('')]
  }

  return res
}

export const diffSequence = (s1: Sequence, s2: Sequence, cursor_pos?: CursorPos) => {
  // only pass fix_unicode=true at the top level, not when diff_main is
  // recursively invoked
  const diffs = diff_main(s1, s2, cursor_pos, true)
  return diffs
}
