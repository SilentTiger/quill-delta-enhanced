import AttributeMap from './AttributeMap';
import Iterator from './Iterator';
import Delta = require('./Delta')

export type OpInsertDateType = string | Delta | number
export type OpDeltaType = number
export type OpRetainType = number | Delta

interface Op {
  // only one property out of {insert, delete, retain} will be present
  insert?: OpInsertDateType;
  delete?: OpDeltaType;
  retain?: OpRetainType;

  attributes?: AttributeMap;
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
    } else {
      return typeof op.insert === 'string' ? op.insert.length : 1;
    }
  }
}

export default Op;
