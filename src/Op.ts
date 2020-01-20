import AttributeMap from './AttributeMap';
import Iterator from './Iterator';
import Delta = require('./Delta')

export type OpInsertDataType = string | Delta | number
export type OpDeleteType = number
export type OpRetainType = number | Delta

interface Op {
  // only one property out of {insert, delete, retain} will be present
  insert?: OpInsertDataType;
  delete?: OpDeleteType;
  retain?: OpRetainType;

  attributes?: AttributeMap;
  key?: number;
}

namespace Op {
  export function iterator(ops: Op[]) {
    return new Iterator(ops);
  }

  export function length(op: Op): number {
    if (typeof op.delete === 'number') {
      return op.delete;
    } else if (typeof op.retain === 'number') {
      return op.retain;
    } else if (typeof op.retain === 'object') { 
      return 1
    } else if (typeof op.insert === 'string') {
      return op.insert.length
    } else if (typeof op.insert === 'number') {
      return op.insert
    } {
      return 1;
    }
  }
}

export default Op;
