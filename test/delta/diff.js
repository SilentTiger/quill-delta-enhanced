var Delta = require('../../dist/Delta');

describe('diff()', function() {
  it('insert', function() {
    var a = new Delta().insert('A');
    var b = new Delta().insert('AB');
    var expected = new Delta().retain(1).insert('B');
    expect(a.diff(b)).toEqual(expected);
  });

  it('delete', function() {
    var a = new Delta().insert('AB');
    var b = new Delta().insert('A');
    var expected = new Delta().retain(1).delete(1);
    expect(a.diff(b)).toEqual(expected);
  });

  it('retain', function() {
    var a = new Delta().insert('A');
    var b = new Delta().insert('A');
    var expected = new Delta();
    expect(a.diff(b)).toEqual(expected);
  });

  it('format', function() {
    var a = new Delta().insert('A');
    var b = new Delta().insert('A', { bold: true });
    var expected = new Delta().retain(1, { bold: true });
    expect(a.diff(b)).toEqual(expected);
  });

  it('object attributes', function() {
    var a = new Delta().insert('A', {
      font: { family: 'Helvetica', size: '15px' },
    });
    var b = new Delta().insert('A', {
      font: { family: 'Helvetica', size: '15px' },
    });
    var expected = new Delta();
    expect(a.diff(b)).toEqual(expected);
  });

  it('embed integer match', function() {
    var a = new Delta().insert(1);
    var b = new Delta().insert(1);
    var expected = new Delta();
    expect(a.diff(b)).toEqual(expected);
  });

  it('embed integer mismatch', function() {
    var a = new Delta().insert(1);
    var b = new Delta().insert(2);
    var expected = new Delta().retain(1).insert(1);
    expect(a.diff(b)).toEqual(expected);
  });

  it('embed object match', function() {
    var a = new Delta().insert(new Delta().insert('a'));
    var b = new Delta().insert(new Delta().insert('a'));
    var expected = new Delta();
    expect(a.diff(b)).toEqual(expected);
  });

  it('embed object mismatch', function() {
    var a = new Delta().insert(new Delta().insert('a'));
    var b = new Delta().insert(new Delta().insert('ab'));
    var expected = new Delta().retain(new Delta().retain(1).insert('b'))
    expect(a.diff(b)).toEqual(expected);
  });

  it('embed false positive', function() {
    var a = new Delta().insert(1);
    var b = new Delta().insert(String.fromCharCode(0)); // Placeholder char for embed in diff()
    var expected = new Delta().insert(String.fromCharCode(0)).delete(1);
    expect(a.diff(b)).toEqual(expected);
  });

  it('error on non-documents', function() {
    var a = new Delta().insert('A');
    var b = new Delta().retain(1).insert('B');
    expect(function() {
      a.diff(b);
    }).toThrow();
    expect(function() {
      b.diff(a);
    }).toThrow();
  });

  it('inconvenient indexes', function() {
    var a = new Delta()
      .insert('12', { bold: true })
      .insert('34', { italic: true });
    var b = new Delta().insert('123', { color: 'red' });
    var expected = new Delta()
      .retain(2, { bold: null, color: 'red' })
      .retain(1, { italic: null, color: 'red' })
      .delete(1);
    expect(a.diff(b)).toEqual(expected);
  });

  it('combination', function() {
    var a = new Delta()
      .insert('Bad', { color: 'red' })
      .insert('cat', { color: 'blue' });
    var b = new Delta()
      .insert('Good', { bold: true })
      .insert('dog', { italic: true });
    var expected = new Delta()
      .insert('Good', { bold: true })
      .delete(2)
      .retain(1, { italic: true, color: null })
      .delete(3)
      .insert('og', { italic: true });
    expect(a.diff(b)).toEqual(expected);
  });

  it('same document', function() {
    var a = new Delta().insert('A').insert('B', { bold: true });
    expected = new Delta();
    expect(a.diff(a)).toEqual(expected);
  });

  it('immutability', function() {
    var attr1 = { color: 'red' };
    var attr2 = { color: 'red' };
    var a1 = new Delta().insert('A', attr1);
    var a2 = new Delta().insert('A', attr1);
    var b1 = new Delta().insert('A', { bold: true }).insert('B');
    var b2 = new Delta().insert('A', { bold: true }).insert('B');
    var expected = new Delta()
      .retain(1, { bold: true, color: null })
      .insert('B');
    expect(a1.diff(b1)).toEqual(expected);
    expect(a1).toEqual(a2);
    expect(b2).toEqual(b2);
    expect(attr1).toEqual(attr2);
  });

  it('non-document', function() {
    var a = new Delta().insert('Test');
    var b = new Delta().delete(4);
    expect(function() {
      a.diff(b);
    }).toThrow(new Error('diff() called on non-document'));
  });

  it('diff simple delta', function () {
    var a = new Delta().insert(new Delta().insert('a'), null, 1)
    var b = new Delta().insert(new Delta().insert('b'), null, 2).insert(new Delta().insert('a'), null, 1)
    var expected = new Delta().insert(new Delta().insert('b'))
    expect(a.diff(b)).toEqual(expected)
  })

  it('diff string and delta', function () {
    var a = new Delta().insert('aaa').insert(new Delta().insert('A'), null, 1)
    var b = new Delta().insert('aa').insert(new Delta().insert('B')).insert(new Delta().insert('A'), null, 1)
    var expected = new Delta().retain(2).delete(1).insert(new Delta().insert('B'))
    expect(a.diff(b)).toEqual(expected)
  })

  it('diff string and delta with attributes', function () {
    var a = new Delta().insert('aaa')
      .insert(new Delta().insert('A', { A: 'A' }), { a: 'a' }, 1)
    var b = new Delta().insert('abc').insert(new Delta().insert('B'))
      .insert(new Delta().insert('A', { A: 'AB', AB: 'BA' }), { a: 'ab', ab: 'ba' }, 1)
    var expected = new Delta().retain(1).insert('bc').delete(2)
      .insert(new Delta().insert('B'))
      .retain(new Delta().retain(1, { A: 'AB', AB: 'BA' }), { a: 'ab', ab: 'ba' })
    expect(a.diff(b)).toEqual(expected)
  })
});
