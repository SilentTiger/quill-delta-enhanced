var Delta = require('../dist/Delta');
var Op = require('../dist/Delta').Op;

describe('Op', function() {
  describe('length()', function() {
    it('delete', function() {
      expect(Op.length({ delete: 5 })).toEqual(5);
    });

    it('retain', function() {
      expect(Op.length({ retain: 2 })).toEqual(2);
    });

    it('insert text', function() {
      expect(Op.length({ insert: 'text' })).toEqual(4);
    });

    it('insert embed', function() {
      expect(Op.length({ insert: 2 })).toEqual(2);
    });
  });

  describe('iterator()', function() {
    beforeEach(function() {
      this.delta = new Delta()
        .insert('Hello', { bold: true })
        .retain(3)
        .insert(2, { src: 'http://quilljs.com/' })
        .delete(4);
    });

    it('hasNext() true', function() {
      var iter = Op.iterator(this.delta.ops);
      expect(iter.hasNext()).toEqual(true);
    });

    it('hasNext() false', function() {
      var iter = Op.iterator([]);
      expect(iter.hasNext()).toEqual(false);
    });

    it('peekLength() offset === 0', function() {
      var iter = Op.iterator(this.delta.ops);
      expect(iter.peekLength()).toEqual(5);
      iter.next();
      expect(iter.peekLength()).toEqual(3);
      iter.next();
      expect(iter.peekLength()).toEqual(2);
      iter.next();
      expect(iter.peekLength()).toEqual(4);
    });

    it('peekLength() offset > 0', function() {
      var iter = Op.iterator(this.delta.ops);
      iter.next(2);
      expect(iter.peekLength()).toEqual(5 - 2);
    });

    it('peekLength() no ops left', function() {
      var iter = Op.iterator([]);
      expect(iter.peekLength()).toEqual(Infinity);
    });

    it('peekType()', function() {
      var iter = Op.iterator(this.delta.ops);
      expect(iter.peekType()).toEqual('insert');
      iter.next();
      expect(iter.peekType()).toEqual('retain');
      iter.next();
      expect(iter.peekType()).toEqual('insert');
      iter.next();
      expect(iter.peekType()).toEqual('delete');
      iter.next();
      expect(iter.peekType()).toEqual('retain');
    });

    it('next()', function() {
      var iter = Op.iterator(this.delta.ops);
      for (var i = 0; i < this.delta.ops.length; i += 1) {
        expect(iter.next()).toEqual(this.delta.ops[i]);
      }
      expect(iter.next()).toEqual({ retain: Infinity });
      expect(iter.next(4)).toEqual({ retain: Infinity });
      expect(iter.next()).toEqual({ retain: Infinity });
    });

    it('next(length)', function () {
      var iter = Op.iterator(this.delta.ops);
      expect(iter.next(2)).toEqual({
        insert: 'He',
        attributes: { bold: true },
      });
      expect(iter.next(10)).toEqual({
        insert: 'llo',
        attributes: { bold: true },
      });
      expect(iter.next(1)).toEqual({ retain: 1 });
      expect(iter.next(2)).toEqual({ retain: 2 });
      expect(iter.next(1)).toEqual({ insert: 1, attributes: { src: 'http://quilljs.com/' } })
      expect(iter.next(1)).toEqual({ insert: 1, attributes: { src: 'http://quilljs.com/' } })

      var a = new Delta().insert(3).insert('abc')
      var iterA = Op.iterator(a.ops)
      expect(iterA.next(1)).toEqual({ insert: 1 })
      expect(iterA.next(2)).toEqual({ insert: 2 })
      expect(iterA.next(2)).toEqual({ insert: 'ab' })
    });

    it('rest()', function() {
      var iter = Op.iterator(this.delta.ops);
      iter.next(2);
      expect(iter.rest()).toEqual([
        { insert: 'llo', attributes: { bold: true } },
        { retain: 3 },
        { insert: 2, attributes: { src: 'http://quilljs.com/' } },
        { delete: 4 },
      ]);
      iter.next(3);
      expect(iter.rest()).toEqual([
        { retain: 3 },
        { insert: 2, attributes: { src: 'http://quilljs.com/' } },
        { delete: 4 },
      ]);
      iter.next(3);
      iter.next(2);
      iter.next(4);
      expect(iter.rest()).toEqual([]);
    });
  });
});
