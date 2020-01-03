var Delta = require('../../dist/Delta');

describe('embedTransform()', function () {
  it('insert + insert', function () {
    var deltaA = new Delta().insert('a')
    var deltaB = new Delta().insert('b')
    var a1 = new Delta().insert(deltaA);
    var b1 = new Delta().insert(deltaB);
    var a2 = new Delta(a1);
    var b2 = new Delta(b1);
    var expected1 = new Delta().retain(1).insert(deltaB);
    var expected2 = new Delta().insert(deltaB);
    expect(a1.transform(b1, true)).toEqual(expected1);
    expect(a2.transform(b2, false)).toEqual(expected2);
  });

  it('insert + retain', function () {
    var deltaA = new Delta().insert('a')
    var deltaB = new Delta().insert('b')
    var a = new Delta().insert(deltaA);
    var b = new Delta().retain(deltaB, { bold: true, color: 'red' });
    var expected = new Delta().retain(1).retain(deltaB, { bold: true, color: 'red' });
    expect(a.transform(b, true)).toEqual(expected);
  });

  it('insert + delete', function () {
    var deltaA = new Delta().insert('a')
    var a = new Delta().insert(deltaA);
    var b = new Delta().delete(2);
    var expected = new Delta().retain(1).delete(2)
    expect(a.transform(b)).toEqual(expected)
  })

  it('retain + retain', function () {
    var deltaA = new Delta().insert('a')
    var deltaB = new Delta().insert('b')
    var a = new Delta().retain(deltaA);
    var b = new Delta().retain(deltaB, { bold: true, color: 'red' });

    var expected1 = new Delta().retain(new Delta().retain(1).insert('b'), { bold: true, color: 'red' });
    expect(a.transform(b, true)).toEqual(expected1);
    var expected2 = new Delta().retain(new Delta().insert('b'), { bold: true, color: 'red' });
    expect(a.transform(b)).toEqual(expected2);

  })
})
