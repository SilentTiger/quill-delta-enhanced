var _ = require('lodash');
var seedrandom = require('seedrandom');
var { diff, DiffOp, diffSequence } = require('../dist/diff.js');

var ITERATIONS = 10000;
var ALPHABET = 'GATTACA';
var LENGTH = 100;
var EMOJI_MAX_LENGTH = 50;

var seed = Math.floor(Math.random() * 10000);
var random = seedrandom(seed);

console.log('Running computing ' + ITERATIONS + ' diffs with seed ' + seed + '...');
console.log('Generating strings...');
var strings = [];
for (var i = 0; i <= ITERATIONS; ++i) {
  var chars = [];
  for (var l = 0; l < LENGTH; ++l) {
    var letter = ALPHABET.substr(Math.floor(random() * ALPHABET.length), 1);
    chars.push(letter);
  }
  strings.push(chars.join(''));
}

// emojis chosen to share high and low surrogates!
var EMOJI_ALPHABET = ['_', '🤗', '🔗', '🤘', '🔘'];

console.log('Generating emoji strings...');
var emoji_strings = [];
for (var i = 0; i <= ITERATIONS; ++i) {
  var letters = [];
  var len = Math.floor(random() * EMOJI_MAX_LENGTH);
  for (var l = 0; l < len; ++l) {
    var letter = EMOJI_ALPHABET[Math.floor(random() * EMOJI_ALPHABET.length)];
    letters.push(letter);
  }
  emoji_strings.push(letters.join(''));
}

describe('diff string', function () {
  it('basic', function () {
    var a = 'hello world'
    var b = 'llo w'
    var result = diff(a, b)
    applyDiff(result, a, b)
  })
  it('Running regression tests...', function () {
    [
      ['GAATAAAAAAAGATTAACAT', 'AAAAACTTGTAATTAACAAC'],
      ['🔘🤘🔗🔗', '🔗🤗🤗__🤗🤘🤘🤗🔗🤘🔗'],
      ['🔗🤗🤗__🤗🤘🤘🤗🔗🤘🔗', '🤗🤘🔘'],
      ['🤘🤘🔘🔘_🔘🔗🤘🤗🤗__🔗🤘', '🤘🔘🤘🔗🤘🤘🔗🤗🤘🔘🔘'],
      ['🤗🤘🤗🔘🤘🔘🤗_🤗🔗🤘🤗_🤘🔗🤗🤘🔗🤘🤘🤘🔗🤗🔗🔗🔗🤗_🤘🔗🤗🤗🔘🤗🤗🤘🤗',
        '_🤗🤘_🤘🤘🔘🤗🔘🤘_🔘🤗🔗🔘🔗🤘🔗🤘🤗🔗🔗🔗🤘🔘_🤗🤘🤘🤘__🤘_🔘🤘🤘_🔗🤘🔘'],
      ['🔗🤘🤗🔘🔘🤗', '🤘🤘🤘🤗🔘🔗🔗'],
      ['🔘_🔗🔗🔗🤗🔗', '🤘🤗🔗🤗_🤘🔘_'],
    ].forEach(function (data) {
      var result = diff(data[0], data[1]);
      applyDiff(result, data[0], data[1]);
    });
  })

  it('Running fuzz tests *without* cursor information...', function () {
    for (var i = 0; i < ITERATIONS; ++i) {
      var result = diff(strings[i], strings[i + 1]);
      applyDiff(result, strings[i], strings[i + 1]);
    }
  });

  it('Running fuzz tests *with* cursor information', function () {
    for (var i = 0; i < ITERATIONS; ++i) {
      var cursor_pos = Math.floor(random() * strings[i].length + 1);
      var diffs = diff(strings[i], strings[i + 1], cursor_pos);
      applyDiff(diffs, strings[i], strings[i + 1]);
    }
  });

  it('Running cursor tests', function () {
    [
      ['', 0, '', null, ''],

      ['', 0, 'a', null, '+a'],
      ['a', 0, 'aa', null, '+a=a'],
      ['a', 1, 'aa', null, '=a+a'],
      ['aa', 0, 'aaa', null, '+a=aa'],
      ['aa', 1, 'aaa', null, '=a+a=a'],
      ['aa', 2, 'aaa', null, '=aa+a'],
      ['aaa', 0, 'aaaa', null, '+a=aaa'],
      ['aaa', 1, 'aaaa', null, '=a+a=aa'],
      ['aaa', 2, 'aaaa', null, '=aa+a=a'],
      ['aaa', 3, 'aaaa', null, '=aaa+a'],

      ['a', 0, '', null, '-a'],
      ['a', 1, '', null, '-a'],
      ['aa', 0, 'a', null, '-a=a'],
      ['aa', 1, 'a', null, '-a=a'],
      ['aa', 2, 'a', null, '=a-a'],
      ['aaa', 0, 'aa', null, '-a=aa'],
      ['aaa', 1, 'aa', null, '-a=aa'],
      ['aaa', 2, 'aa', null, '=a-a=a'],
      ['aaa', 3, 'aa', null, '=aa-a'],

      ['', 0, '', 0, ''],

      ['', 0, 'a', 1, '+a'],
      ['a', 0, 'aa', 1, '+a=a'],
      ['a', 1, 'aa', 2, '=a+a'],
      ['aa', 0, 'aaa', 1, '+a=aa'],
      ['aa', 1, 'aaa', 2, '=a+a=a'],
      ['aa', 2, 'aaa', 3, '=aa+a'],
      ['aaa', 0, 'aaaa', 1, '+a=aaa'],
      ['aaa', 1, 'aaaa', 2, '=a+a=aa'],
      ['aaa', 2, 'aaaa', 3, '=aa+a=a'],
      ['aaa', 3, 'aaaa', 4, '=aaa+a'],

      ['a', 1, '', 0, '-a'],
      ['aa', 1, 'a', 0, '-a=a'],
      ['aa', 2, 'a', 1, '=a-a'],
      ['aaa', 1, 'aa', 0, '-a=aa'],
      ['aaa', 2, 'aa', 1, '=a-a=a'],
      ['aaa', 3, 'aa', 2, '=aa-a'],

      ['a', 1, '', 0, '-a'],
      ['aa', 1, 'a', 0, '-a=a'],
      ['aa', 2, 'a', 1, '=a-a'],
      ['aaa', 1, 'aa', 0, '-a=aa'],
      ['aaa', 2, 'aa', 1, '=a-a=a'],
      ['aaa', 3, 'aa', 2, '=aa-a'],

      // forward-delete
      ['a', 0, '', 0, '-a'],
      ['aa', 0, 'a', 0, '-a=a'],
      ['aa', 1, 'a', 1, '=a-a'],
      ['aaa', 0, 'aa', 0, '-a=aa'],
      ['aaa', 1, 'aa', 1, '=a-a=a'],
      ['aaa', 2, 'aa', 2, '=aa-a'],

      ['bob', 0, 'bobob', null, '+bo=bob'],
      ['bob', 1, 'bobob', null, '=b+ob=ob'],
      ['bob', 2, 'bobob', null, '=bo+bo=b'],
      ['bob', 3, 'bobob', null, '=bob+ob'],
      ['bob', 0, 'bobob', 2, '+bo=bob'],
      ['bob', 1, 'bobob', 3, '=b+ob=ob'],
      ['bob', 2, 'bobob', 4, '=bo+bo=b'],
      ['bob', 3, 'bobob', 5, '=bob+ob'],
      ['bobob', 2, 'bob', null, '-bo=bob'],
      ['bobob', 3, 'bob', null, '=b-ob=ob'],
      ['bobob', 4, 'bob', null, '=bo-bo=b'],
      ['bobob', 5, 'bob', null, '=bob-ob'],
      ['bobob', 2, 'bob', 0, '-bo=bob'],
      ['bobob', 3, 'bob', 1, '=b-ob=ob'],
      ['bobob', 4, 'bob', 2, '=bo-bo=b'],
      ['bobob', 5, 'bob', 3, '=bob-ob'],

      ['bob', 1, 'b', null, '=b-ob'],

      ['hello', [0, 5], 'h', 1, '-hello+h'],
      ['yay', [0, 3], 'y', 1, '-yay+y'],
      ['bobob', [1, 4], 'bob', 2, '=b-obo+o=b'],
    ].forEach(function (data) {
      var oldText = data[0];
      var newText = data[2];
      var oldRange = typeof data[1] === 'number' ?
        { index: data[1], length: 0 } :
        { index: data[1][0], length: data[1][1] - data[1][0] };
      var newRange = typeof data[3] === 'number' ?
        { index: data[3], length: 0 } :
        data[3] === null ? null : { index: data[3][0], length: data[3][1] - data[3][0] };
      var expected = parseDiff(data[4]);
      if (newRange === null && typeof data[1] !== 'number') {
        throw new Error('invalid test case');
      }
      var cursorInfo = newRange === null ? data[1] : {
        oldRange: oldRange,
        newRange: newRange,
      };
      doCursorTest(oldText, newText, cursorInfo, expected);
      doCursorTest('x' + oldText, 'x' + newText, shiftCursorInfo(cursorInfo, 1), diffPrepend(expected, 'x'));
      doCursorTest(oldText + 'x', newText + 'x', cursorInfo, diffAppend(expected, 'x'));
    });
  });
  it('Running emoji tests', function () {
    [
      ['🐶', '🐯', '-🐶+🐯'],
      // ['👨🏽', '👩🏽', '-👨+👩=🏽'],
      // ['👩🏼', '👩🏽', '=👩-🏼+🏽'],
      // I've made some change on this place, the emoji will not be treated as two characters but one
      ['👨🏽', '👩🏽', '-👨🏽+👩🏽'],
      ['👩🏼', '👩🏽', '-👩🏼+👩🏽'],
  
      ['🍏🍎', '🍎', '-🍏=🍎'],
      ['🍎', '🍏🍎', '+🍏=🍎'],
  
    ].forEach(function (data) {
      var oldText = data[0];
      var newText = data[1];
      var expected = parseDiff(data[2]);
      doEmojiTest(oldText, newText, expected);
      doEmojiTest('x' + oldText, 'x' + newText, diffPrepend(expected, 'x'));
      doEmojiTest(oldText + 'x', newText + 'x', diffAppend(expected, 'x'));
    });
  });
  it('Running emoji fuzz tests...', function () {
    for (var i = 0; i < ITERATIONS; ++i) {
      var oldText = emoji_strings[i];
      var newText = emoji_strings[i + 1];
      var result = diff(oldText, newText);
      applyDiff(result, oldText, newText);
    }
  });
})

describe('diff string and number id', function () {
  it('only number', function () {
    var a = [1, 2, 3]
    var b = [1, 2, 3]
    var c = [1, 3]
    var d = [2, 3]
    var e = [1, 2]
    var f = [2]
    var g = []
    var h = [4, 5, 6]
    var resB = diffSequence(a, b)
    var resC = diffSequence(a, c)
    var resD = diffSequence(a, d)
    var resE = diffSequence(a, e)
    var resF = diffSequence(a, f)
    var resG = diffSequence(a, g)
    var resH = diffSequence(a, h)
    expect(resB).toEqual([[0, [1, 2, 3]]])
    expect(resC).toEqual([[0, [1]], [-1, [2]], [0, [3]]])
    expect(resD).toEqual([[-1, [1]], [0, [2, 3]]])
    expect(resE).toEqual([[0, [1, 2]], [-1, [3]]])
    expect(resF).toEqual([[-1, [1]], [0, [2]], [-1, [3]]])
    expect(resG).toEqual([[-1, [1, 2, 3]]])
    expect(resH).toEqual([[-1, [1, 2, 3]], [1, [4, 5, 6]]])
  })

  it('string and number mixed', function () {
    var a = ['a', 97, '3']
    var b = ['a', 97, '3']
    var c = ['a', '3']
    var d = [97, '3']
    var e = ['a', 97]
    var f = [97]
    var g = []
    var h = [3, '9', 6]
    var resB = diffSequence(a, b)
    var resC = diffSequence(a, c)
    var resD = diffSequence(a, d)
    var resE = diffSequence(a, e)
    var resF = diffSequence(a, f)
    var resG = diffSequence(a, g)
    var resH = diffSequence(a, h)
    expect(resB).toEqual([[0, ['a', 97, '3']]])
    expect(resC).toEqual([[0, ['a']], [-1, [97]], [0, ['3']]])
    expect(resD).toEqual([[-1, ['a']], [0, [97, '3']]])
    expect(resE).toEqual([[0, ['a', 97]], [-1, ['3']]])
    expect(resF).toEqual([[-1, ['a']], [0, [97]], [-1, ['3']]])
    expect(resG).toEqual([[-1, ['a', 97, '3']]])
    expect(resH).toEqual([[-1, ['a', 97, '3']], [1, [3, '9', 6]]])
  })
})

function parseDiff(str) {
  if (!str) {
    return [];
  }
  return str.split(/(?=[+\-=])/).map(function (piece) {
    var symbol = piece.charAt(0);
    var text = piece.slice(1);
    return [
      symbol === '+' ? DiffOp.DIFF_INSERT : symbol === '-' ? DiffOp.DIFF_DELETE : DiffOp.DIFF_EQUAL,
      text
    ]
  });
}

function diffPrepend(tuples, text) {
  if (tuples.length > 0 && tuples[0][0] === DiffOp.DIFF_EQUAL) {
    return [[DiffOp.DIFF_EQUAL, text + tuples[0][1]]].concat(tuples.slice(1));
  } else {
    return [[DiffOp.DIFF_EQUAL, text]].concat(tuples);
  }
}

function diffAppend(tuples, text) {
  var lastTuple = tuples[tuples.length - 1];
  if (lastTuple && lastTuple[0] === DiffOp.DIFF_EQUAL) {
    return tuples.slice(0, -1).concat([[DiffOp.DIFF_EQUAL, lastTuple[1] + text]]);
  } else {
    return tuples.concat([[DiffOp.DIFF_EQUAL, text]]);
  }
}

function shiftCursorInfo(cursorInfo, amount) {
  if (typeof cursorInfo === 'number') {
    return cursorInfo + amount;
  } else {
    return {
      oldRange: {
        index: cursorInfo.oldRange.index + amount,
        length: cursorInfo.oldRange.length,
      },
      newRange: {
        index: cursorInfo.newRange.index + amount,
        length: cursorInfo.newRange.length,
      },
    }
  }
}

function doCursorTest(oldText, newText, cursorInfo, expected) {
  var result = diff(oldText, newText, cursorInfo);
  if (!_.isEqual(result, expected)) {
    console.log([oldText, newText, cursorInfo]);
    console.log(result, '!==', expected);
    throw new Error('cursor test failed');
  }
}

function doEmojiTest(oldText, newText, expected) {
  var result = diff(oldText, newText);
  if (!_.isEqual(result, expected)) {
    console.log(oldText, newText, expected);
    console.log(result, '!==', expected);
    throw new Error('Emoji simple test case failed');
  }
}

// Applies a diff to text, throwing an error if diff is invalid or incorrect
function applyDiff(diffs, text, expectedResult) {
  var pos = 0;
  function throwError(message) {
    console.log(diffs, text, expectedResult);
    throw new Error(message);
  }
  function expect(expected) {
    var found = text.substr(pos, expected.length);
    if (found !== expected) {
      throwError('Expected "' + expected + '", found "' + found + '"');
    }
  }
  var result = '';
  var inserts_since_last_equality = 0;
  var deletes_since_last_equality = 0;
  for (var i = 0; i < diffs.length; i++) {
    var d = diffs[i];
    if (!d[1]) {
      throwError('Empty tuple in diff')
    }
    var firstCharCode = d[1].charCodeAt(0);
    var lastCharCode = d[1].slice(-1).charCodeAt(0);
    if (firstCharCode >= 0xDC00 && firstCharCode <= 0xDFFF ||
      lastCharCode >= 0xD800 && lastCharCode <= 0xDBFF) {
      throwError('Bad unicode diff tuple')
    }
    switch (d[0]) {
      case DiffOp.DIFF_EQUAL:
        if (i !== 0 && !inserts_since_last_equality && !deletes_since_last_equality) {
          throwError('two consecutive equalities in diff');
        }
        inserts_since_last_equality = 0;
        deletes_since_last_equality = 0;
        expect(d[1]);
        result += d[1];
        pos += d[1].length;
        break;
      case DiffOp.DIFF_DELETE:
        if (deletes_since_last_equality) {
          throwError('multiple deletes between equalities')
        }
        if (inserts_since_last_equality) {
          throwError('delete following insert in diff')
        }
        deletes_since_last_equality++;
        expect(d[1]);
        pos += d[1].length;
        break
      case DiffOp.DIFF_INSERT:
        if (inserts_since_last_equality) {
          throwError('multiple inserts between equalities')
        }
        inserts_since_last_equality++;
        result += d[1];
        break;
    }
  }
  if (pos !== text.length) {
    throwError('Diff did not consume entire input text');
  }
  if (result !== expectedResult) {
    console.log(diffs, text, expectedResult, result);
    throw new Error('Diff not correct')
  }
  return result;
}
