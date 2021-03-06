import equal from 'fast-deep-equal';
import extend from 'extend';
import { CursorInfo, DiffOp, Sequence, diffSequence } from './diff';
import AttributeMap from './AttributeMap';
import Op, { OpInsertDataType, OpDeleteType, OpRetainType } from './Op';
import toArray from 'lodash/toArray'

const NULL_CHARACTER = String.fromCharCode(0); // Placeholder char for embed in diff()

type OpJson = {
  insert?: string | number | { ops: OpJson[] }
  retain?: number | { ops: OpJson[] }
  delete?: number
  attributes?: AttributeMap;
}

type ParsedDelta = Array<ParsedDelta[] | string | number | AttributeMap>

class Delta {
  static Op = Op;
  static AttributeMap = AttributeMap;

  static stringify(delta: Delta, final = true): string | ParsedDelta[]{
    let res: Array<ParsedDelta> | string
    if (final) {
      res = ''
    } else {
      res = []
    }
    for (let index = 0; index < delta.ops.length; index++) {
      const op = delta.ops[index];
      let data: ParsedDelta = []
      if (op.insert !== undefined) {
        if (op.insert instanceof Delta) {
          data.push(Delta.stringify(op.insert, false))
        } else {
          data.push(op.insert)
        }
        if (op.attributes !== undefined) {
          data.push(op.attributes)
        }
      } else if (op.retain !== undefined) {
        if (op.retain instanceof Delta) {
          data.push(Delta.stringify(op.retain, false))
        } else {
          data.push(op.retain)
        }
        if (op.attributes !== undefined) {
          data.push(op.attributes)
        }
        data.push(2)
      } else if (op.delete !== undefined) {
        data.push(op.delete)
        data.push(3)
      }
      if (final) {
        res += JSON.stringify(data) + '\n'
      } else {
        (res as ParsedDelta[]).push(data)
      }
    }
    return res
  }

  static parse(str: string): Delta | null {
    const opStrings = str.split('\n')
    if (opStrings.length > 0) {
      // 先去掉最后的 \n 导致的空字符串
      opStrings.pop()
      if (opStrings.length > 0) {
        const ops: Op[] = Array(opStrings.length)
        for (let index = 0; index < opStrings.length; index++) {
          const opJSON: Array<number | string | object> = JSON.parse(opStrings[index])
          ops[index] = Delta.parseOp(opJSON)
        }
        return new Delta({ ops })
      }
    }
    return null
  }

  private static parseOp(opJSON: any[]) {
    if (opJSON[1] === undefined) {
      return { insert: Delta.tryParseEmbedDelta(opJSON[0]) }
    } else if (typeof opJSON[1] === 'number') {
      if (opJSON[1] === 2) {
        return { retain: Delta.tryParseEmbedDelta(opJSON[0]) as Delta | number }
      } else if (opJSON[1] === 3) {
        return { delete: opJSON[0] as number }
      } else {
        throw new Error('unknown op type')
      }
    } else if (typeof opJSON[1] === 'object') {
      if (opJSON[2] === undefined) {
        return { insert: Delta.tryParseEmbedDelta(opJSON[0]), attributes: opJSON[1] }
      } else if (opJSON[2] === 2) {
        return { retain: Delta.tryParseEmbedDelta(opJSON[0]) as Delta | number, attributes: opJSON[1] }
      } else {
        throw new Error('unknown op type')
      }
    } else {
      throw new Error('wrong data type')
    }
  }

  private static tryParseEmbedDelta(data: any): Delta | number | string {
    if (typeof data === 'number' || typeof data === 'string') {
      return data
    } else if (Array.isArray(data)) {
      const ops: Op[] = Array(data.length)
      for (let index = 0; index < data.length; index++) {
        const opJSON: Array<number | string | object> = data[index]
        ops[index] = Delta.parseOp(opJSON)
      }
      return new Delta({ ops })
    }
    throw new Error('unknown embed delta format')
  }

  ops: Op[];
  constructor(ops?: OpJson[] | { ops: Op[] }) {
    let inputOps: any[]
    if (Array.isArray(ops)) {
      inputOps = ops;
    } else if (ops != null && Array.isArray(ops.ops)) {
      inputOps = ops.ops;
    } else {
      inputOps = [];
    }

    for (let index = 0; index < inputOps.length; index++) {
      const op = inputOps[index] as Op;
      if (
        typeof op.insert === 'object' && Array.isArray(op.insert.ops)
      ) {
        op.insert = new Delta(op.insert.ops)
      } else if (typeof op.retain === 'object' && Array.isArray(op.retain.ops)) {
        op.retain = new Delta(op.retain.ops)
      }
    }
    this.ops = inputOps
  }

  insert(arg: OpInsertDataType, attributes?: AttributeMap, key?: number): this {
    const newOp: Op = {};
    if (typeof arg === 'string' && arg.length === 0) {
      return this;
    }
    newOp.insert = arg;
    if (
      attributes != null &&
      typeof attributes === 'object' &&
      Object.keys(attributes).length > 0
    ) {
      newOp.attributes = attributes;
    }
    if (typeof key === 'number') {
      newOp.key = key
    }
    return this.push(newOp);
  }

  delete(length: OpDeleteType): this {
    if (length <= 0) {
      return this;
    }
    return this.push({ delete: length });
  }

  retain(length: OpRetainType, attributes?: AttributeMap): this {
    if (typeof length === 'number' && length <= 0) {
      return this;
    }
    const newOp: Op = { retain: length };
    if (
      attributes != null &&
      typeof attributes === 'object' &&
      Object.keys(attributes).length > 0
    ) {
      newOp.attributes = attributes;
    }
    return this.push(newOp);
  }

  push(newOp: Op): this {
    let index = this.ops.length;
    let lastOp = this.ops[index - 1];
    newOp = extend(true, {}, newOp);
    if (typeof lastOp === 'object') {
      // 如果最后的操作和新增的操作都是删除，就合并这两个操作
      if (
        typeof newOp.delete === 'number' &&
        typeof lastOp.delete === 'number'
      ) {
        lastOp.delete += newOp.delete;
        return this;
      }
      // Since it does not matter if we insert before or after deleting at the same index,
      // always prefer to insert first
      if (typeof lastOp.delete === 'number' && newOp.insert != null) {
        index -= 1;
        lastOp = this.ops[index - 1];
        if (typeof lastOp !== 'object') {
          this.ops.unshift(newOp);
          return this;
        }
      }
      if (equal(newOp.attributes, lastOp.attributes)) {
        if (
          typeof newOp.insert === 'string' &&
          typeof lastOp.insert === 'string'
        ) {
          this.ops[index - 1] = { insert: lastOp.insert + newOp.insert };
          if (typeof newOp.attributes === 'object') {
            this.ops[index - 1].attributes = newOp.attributes;
          }
          return this;
        } else if (
          typeof newOp.insert === 'number' &&
          typeof lastOp.insert === 'number'
        ) { 
          lastOp.insert += newOp.insert;
          return this;
        } else if (
          typeof newOp.retain === 'number' &&
          typeof lastOp.retain === 'number'
        ) {
          this.ops[index - 1] = { retain: lastOp.retain + newOp.retain };
          if (typeof newOp.attributes === 'object') {
            this.ops[index - 1].attributes = newOp.attributes;
          }
          return this;
        }
      }
    }
    if (index === this.ops.length) {
      this.ops.push(newOp);
    } else {
      this.ops.splice(index, 0, newOp);
    }
    return this;
  }

  chop(): this {
    const lastOp = this.ops[this.ops.length - 1];
    if (lastOp && lastOp.retain && typeof lastOp.retain === 'number' && !lastOp.attributes) {
      this.ops.pop();
    }
    return this;
  }

  filter(predicate: (op: Op, index: number) => boolean): Op[] {
    return this.ops.filter(predicate);
  }

  forEach(predicate: (op: Op, index: number) => void): void {
    this.ops.forEach(predicate);
  }

  map<T>(predicate: (op: Op, index: number) => T): T[] {
    return this.ops.map(predicate);
  }

  partition(predicate: (op: Op) => boolean): [Op[], Op[]] {
    const passed: Op[] = [];
    const failed: Op[] = [];
    this.forEach(op => {
      const target = predicate(op) ? passed : failed;
      target.push(op);
    });
    return [passed, failed];
  }

  reduce<T>(
    predicate: (accum: T, curr: Op, index: number) => T,
    initialValue: T,
  ): T {
    return this.ops.reduce(predicate, initialValue);
  }

  changeLength(): number {
    return this.reduce((length, elem) => {
      if (elem.insert) {
        return length + Op.length(elem);
      } else if (elem.delete) {
        return length - elem.delete;
      }
      return length;
    }, 0);
  }

  length(): number {
    return this.reduce((length, elem) => {
      return length + Op.length(elem);
    }, 0);
  }

  slice(start: number = 0, end: number = Infinity): Delta {
    const ops = this.sliceOps(start, end)
    return new Delta(ops);
  }

  sliceOps(start: number = 0, end: number = Infinity): Op[] {
    const ops = [];
    const iter = Op.iterator(this.ops);
    let index = 0;
    while (index < end && iter.hasNext()) {
      let nextOp;
      if (index < start) {
        nextOp = iter.next(start - index);
      } else {
        nextOp = iter.next(end - index);
        ops.push(nextOp);
      }
      index += Op.length(nextOp);
    }
    return ops
  }

  compose(other: Delta): Delta {
    const thisIter = Op.iterator(this.ops);
    const otherIter = Op.iterator(other.ops);
    const ops = [];
    const firstOther = otherIter.peek();
    // 先看合入的 delta 的第一条是不是仅仅要修改游标位置
    if (
      firstOther != null &&
      typeof firstOther.retain === 'number' &&
      firstOther.attributes == null
    ) {
      let firstLeft = firstOther.retain;
      while (
        thisIter.peekType() === 'insert' &&
        thisIter.peekLength() <= firstLeft
      ) {
        firstLeft -= thisIter.peekLength();
        ops.push(thisIter.next());
      }
      if (firstOther.retain - firstLeft > 0) {
        otherIter.next(firstOther.retain - firstLeft);
      }
    }
    const delta = new Delta(ops);
    while (thisIter.hasNext() || otherIter.hasNext()) {
      if (otherIter.peekType() === 'insert') {
        delta.push(otherIter.next());
      } else if (thisIter.peekType() === 'delete') {
        delta.push(thisIter.next());
      } else {
        const length = Math.min(thisIter.peekLength(), otherIter.peekLength());
        const thisOp = thisIter.next(length);
        const otherOp = otherIter.next(length);
        if (typeof otherOp.retain === 'number') {
          const newOp: Op = {};
          if (typeof thisOp.retain === 'number') {
            newOp.retain = length;
          } else {
            newOp.insert = thisOp.insert;
          }
          // Preserve null when composing with a retain, otherwise remove it for inserts
          const attributes = AttributeMap.compose(
            thisOp.attributes,
            otherOp.attributes,
            typeof thisOp.retain === 'number',
          );
          if (attributes) {
            newOp.attributes = attributes;
          }
          delta.push(newOp);

          // Optimization if rest of other is just retain
          if (
            !otherIter.hasNext() &&
            equal(delta.ops[delta.ops.length - 1], newOp)
          ) {
            const rest = new Delta(thisIter.rest());
            return delta.concat(rest).chop();
          }

          // Other op should be delete, we could be an insert or retain
          // Insert + delete cancels out
        } else if ( typeof otherOp.retain === 'object' ) {
          // thisOp 分 retain 和 insert 两种情况
          if (typeof thisOp.retain === 'number') {
            const newOp: Op = { retain: otherOp.retain }
            const attributes = AttributeMap.compose(
              thisOp.attributes,
              otherOp.attributes,
              true
            )
            if (attributes) {
              newOp.attributes = attributes
            }
            delta.push(newOp)
          } else if (typeof thisOp.retain === 'object') {
            let retainData: Delta | number = thisOp.retain.compose(otherOp.retain)
            if (retainData.length() === 0) {
              retainData = 1
            }
            const newOp: Op = { retain: retainData }
            const attributes = AttributeMap.compose(
              thisOp.attributes,
              otherOp.attributes,
              false
            )
            if (attributes) {
              newOp.attributes = attributes
            }
            delta.push(newOp)
          } else if (typeof thisOp.insert === 'object') {
            let retainData: Delta | number = thisOp.insert.compose(otherOp.retain)
            if (retainData.length() === 0) {
              retainData = 1
            }
            const newOp: Op = { insert: retainData }
            const attributes = AttributeMap.compose(
              thisOp.attributes,
              otherOp.attributes,
              false
            )
            if (attributes) {
              newOp.attributes = attributes
            }
            delta.push(newOp)
          } else if (typeof thisOp.insert === 'number') { 
            const newOp: Op = { insert: otherOp.retain }
            const attributes = AttributeMap.compose(
              thisOp.attributes,
              otherOp.attributes,
              true
            )
            if (attributes) {
              newOp.attributes = attributes
            }
            delta.push(newOp)
          } else {
            // 如果进入这个分支，说明 thisOp.insert 是 string，这时要和一个 delta 类型 retain Op 进行 compose 操作是非法的
            console.trace('error compose')
          }
        } else if (
          typeof otherOp.delete === 'number' &&
          typeof thisOp.retain === 'number'
        ) {
          delta.push(otherOp);
        }
      }
    }
    return delta.chop();
  }

  concat(other: Delta): Delta {
    const delta = new Delta(this.ops.slice());
    if (other.ops.length > 0) {
      delta.push(other.ops[0]);
      delta.ops = delta.ops.concat(other.ops.slice(1));
    }
    return delta;
  }

  diff(other: Delta, cursor?: number | CursorInfo): Delta {
    if (this.ops === other.ops) {
      return new Delta();
    }
    const sequences: Sequence[] = [this, other].map(delta => {
      const seq:Sequence = []
      delta.forEach(op => {
          if (op.insert != null) {
            if (typeof op.insert === 'string') {
              const stringSeq = toArray(op.insert)
              for (let index = 0; index < stringSeq.length; index++) {
                seq.push(stringSeq[index])
              }
            } else if (typeof op.insert === 'number') {
              if (op.insert === 1) {
                if (typeof op.key === 'number') {
                  seq.push(op.key)
                } else {
                  seq.push(NULL_CHARACTER)
                }
              } else {
                for (let index = 0; index < op.insert; index++) {
                  seq.push(NULL_CHARACTER)
                }
              }
            } else {
              // 如果有 key 就用 key 来计算 diff，否则退化成 NULL_CHARACTER
              if (typeof op.key === 'number') {
                seq.push(op.key)
              } else {
                seq.push(NULL_CHARACTER)
              }
            }
          } else {
            const prep = delta === other ? 'on' : 'with'
            throw new Error('diff() called ' + prep + ' non-document')
          }
        })
      return seq
    })
    const retDelta = new Delta();
    const diffResult = diffSequence(sequences[0], sequences[1], cursor);
    const thisIter = Op.iterator(this.ops);
    const otherIter = Op.iterator(other.ops);
    diffResult.forEach(component => {
      let length = component[1].reduce((totalLength: number, seqItem) => {
        const itemLength = typeof seqItem === 'number' ? 1 : seqItem.length
        return totalLength + itemLength
      }, 0)
      while (length > 0) {
        let opLength = 0;
        switch (component[0]) {
          case DiffOp.DIFF_INSERT:
            opLength = Math.min(otherIter.peekLength(), length);
            retDelta.push(otherIter.next(opLength));
            break;
          case DiffOp.DIFF_DELETE:
            opLength = Math.min(length, thisIter.peekLength());
            thisIter.next(opLength);
            retDelta.delete(opLength);
            break;
          case DiffOp.DIFF_EQUAL:
            opLength = Math.min(
              thisIter.peekLength(),
              otherIter.peekLength(),
              length,
            );
            // 如果进入这个分支，那么thisOp 和 otherOp 都有可能是 number、delta 中的某一种
            // 简单排列组合有 4 种情况
            const thisOp = thisIter.next(opLength);
            const otherOp = otherIter.next(opLength);
            if (equal(thisOp.insert, otherOp.insert)) {
              // 如果 equal 说明都是 number 或都是 delta 且 delta 内容完全相同
              retDelta.retain(
                opLength,
                AttributeMap.diff(thisOp.attributes, otherOp.attributes),
              );
            } else if (
              typeof thisOp.insert === 'object' &&
              typeof otherOp.insert === 'object'
            ) {
              // 如果两个都是 delta 且内容不同
              retDelta.retain(
                thisOp.insert.diff(otherOp.insert),
                AttributeMap.diff(thisOp.attributes, otherOp.attributes)
              )
            } else {
              // 如果一个是 number 另一个是 delta
              retDelta.push(otherOp).delete(opLength);
            }
            break;
        }
        length -= opLength;
      }
    });
    return retDelta.chop();
  }

  invert(base: Delta): Delta {
    let inverted = new Delta();
    let baseIndex = 0
    for (let index = 0; index < this.ops.length; index++) {
      const op = this.ops[index];
      if (op.insert) {
        inverted.delete(Op.length(op));
      } else if (op.retain && op.attributes == null && typeof op.retain === 'number') {
        inverted.retain(op.retain);
        baseIndex += op.retain;
      } else if (op.delete || (typeof op.retain === 'number' && op.attributes)) {
        const length = (op.delete || op.retain) as number;
        const slice = base.sliceOps(baseIndex, baseIndex + length);
        slice.forEach(baseOp => {
          if (op.delete) {
            inverted.push(baseOp);
          } else if (op.retain && op.attributes) {
            inverted.retain(
              Op.length(baseOp),
              AttributeMap.invert(op.attributes, baseOp.attributes),
            );
          }
        });
        baseIndex += length;
      } else if (typeof op.retain === 'object') {
        const retainData = op.retain
        const length = 1
        const slice = base.sliceOps(baseIndex, baseIndex + length);
        slice.forEach(baseOp => {
          // 还原 attributes
          const invertedAttr = op.attributes ? AttributeMap.invert(op.attributes, baseOp.attributes) : null
          // 还原内容，baseOp 的内容是 delta 或 number，这里 baseOp 只能是 insert，如果是 retain 就报错
          // 这里 baseOp 不可能是 insert string
          if (typeof baseOp.insert === 'number') {
            const invertOp: Op = { retain: new Delta().delete(retainData.length()) }
            if (invertedAttr) {
              invertOp.attributes = invertedAttr
            }
            inverted = inverted.concat(new Delta([invertOp]))
          } else if (typeof baseOp.insert === 'object') {
            const invertOp: Op = { retain: retainData.invert(baseOp.insert) }
            if (invertedAttr) {
              invertOp.attributes = invertedAttr
            }
            inverted = inverted.concat(new Delta([invertOp]))
          } else {
            console.trace('can not invert retain', baseOp, op)
          }
        });
        baseIndex += length;
      }
    }
    return inverted.chop();
  }

  transform(index: number, priority?: boolean, chop?: boolean): number;
  transform(other: Delta, priority?: boolean, chop?: boolean): Delta;
  transform(arg: number | Delta, priority: boolean = false, chop: boolean = true): typeof arg {
    priority = !!priority;
    if (typeof arg === 'number') {
      return this.transformPosition(arg, priority);
    }
    const other: Delta = arg;
    const thisIter = Op.iterator(this.ops);
    const otherIter = Op.iterator(other.ops);
    const delta = new Delta();
    while (otherIter.hasNext()) {
      if (
        thisIter.peekType() === 'insert' &&
        (priority || otherIter.peekType() !== 'insert')
      ) {
        delta.retain(Op.length(thisIter.next()));
      } else if (otherIter.peekType() === 'insert') {
        delta.push(otherIter.next());
      } else {
        const length = Math.min(thisIter.peekLength(), otherIter.peekLength());
        const thisOp = thisIter.next(length);
        const otherOp = otherIter.next(length);
        if (thisOp.delete) {
          // Our delete either makes their delete redundant or removes their retain
          continue
        } else if (otherOp.delete) {
          delta.push(otherOp)
        } else {
          // We retain either their retain or insert
          const retainAttr = AttributeMap.transform(
            thisOp.attributes,
            otherOp.attributes,
            priority,
          )
          if (
            typeof thisOp.retain === 'number' ||
            (
              typeof otherOp.insert === 'number' ||
              typeof otherOp.retain === 'number'
            )
          ) {
            let retainData: Delta | number = length
            if (typeof otherOp.retain === 'object') {
              retainData = otherOp.retain
            }
            delta.retain(
              retainData,
              retainAttr,
            )
          } else {
            const otherData: Delta = (otherOp.insert ?? otherOp.retain) as Delta
            delta.retain(
              (thisOp.retain as Delta).transform(otherData, priority),
              retainAttr
            )
          }
        }
      }
    }
    if (chop) {
      return delta.chop()
    } else {
      return delta;
    }
  }

  transformPosition(index: number, priority: boolean = false): number {
    priority = !!priority;
    const thisIter = Op.iterator(this.ops);
    let offset = 0;
    while (thisIter.hasNext() && offset <= index) {
      const length = thisIter.peekLength();
      const nextType = thisIter.peekType();
      thisIter.next();
      if (nextType === 'delete') {
        index -= Math.min(length, index - offset);
        continue;
      } else if (nextType === 'insert' && (offset < index || !priority)) {
        index += length;
      }
      offset += length;
    }
    return index;
  }

  // private parseSequence(seq: Sequence): Array<string | number> {
  //   const res:Array<string | number> = []
  //   let stringCache = ''
  //   for (let index = 0; index < seq.length; index++) {
  //     const element = seq[index]
  //     if (typeof element === 'number') {
  //       if (stringCache.length > 0) {
  //         res.push(stringCache)
  //         stringCache = ''
  //       }
  //       res.push(element)
  //     } else {
  //       stringCache += element
  //     }
  //   }
  //   if (stringCache.length > 0) {
  //     res.push(stringCache)
  //   }
  //   return res
  // }
}

export = Delta;
