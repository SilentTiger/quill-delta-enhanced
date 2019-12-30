var Delta = require('../../dist/Delta');

describe('compose()', function () {
  it('insert delta + retain number attr', function () {
    var a = new Delta().insert(new Delta().insert('a'))
    var b = new Delta().retain(1, { b: 'b' })
    var expected = new Delta().insert(new Delta().insert('a'), { b: 'b' })
    expect(a.compose(b)).toEqual(expected)
  })

  it('insert delta + retain embed number attr', function () {
    var a = new Delta().insert(new Delta().insert('a'))
    var b = new Delta().retain(new Delta().retain(1, { a: 'a' }))
    var expected = new Delta().insert(new Delta().insert('a', { a: 'a' }))
    expect(a.compose(b)).toEqual(expected)
  })

  it('insert delta + retain delta', function () {
    var a = new Delta().insert(new Delta().insert('a'))
    var b = new Delta().retain(new Delta().insert('b'), { b: 'a' })
    var expected = new Delta().insert(new Delta().insert('ba'), { b: 'a' })
    expect(a.compose(b)).toEqual(expected)
  })

  it('insert number + retain delta', function () {
    var a = new Delta().insert(1)
    var b = new Delta().retain(new Delta().insert('b'))
    var expected = new Delta().insert(new Delta().insert('b'))
    var res = a.compose(b)
    expect(res).toEqual(expected)
  })

  it('insert number 2 + retain delta', function () { 
    var a = new Delta().insert(2, {attr: 'attr'})
    var b = new Delta().retain(new Delta().insert('b'))
    var expected = new Delta().insert(new Delta().insert('b'), {attr: 'attr'}).insert(1, {attr: 'attr'})
    var res = a.compose(b)
    expect(res).toEqual(expected)
  })

  it('retain number + retain delta', function () {
    var a = new Delta().retain(2, { a: 'a' }).insert('a')
    var b = new Delta().retain(new Delta().insert('b'))
    var expected = new Delta().retain(new Delta().insert('b'), { a: 'a' }).retain(1, { a: 'a' }).insert('a')
    expect(a.compose(b)).toEqual(expected)
  })

  it('retain delta + retain delta', function () {
    var a = new Delta().retain(new Delta().insert('a'), { a: 'a' })
    var b = new Delta().retain(new Delta().insert('b'))
    var expected = new Delta().retain(new Delta().insert('ba'), { a: 'a' })
    var res = a.compose(b)
    expect(res).toEqual(expected)
  })

  it('retain delta + retain delta remove', function () {
    var a = new Delta().retain(new Delta().insert('a')).insert('aa')
    var b = new Delta().retain(new Delta().delete(1))
    var expected = new Delta().retain(1).insert('aa')
    var res = a.compose(b)
    expect(res).toEqual(expected)
  })
})
