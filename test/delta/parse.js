var Delta = require('../../dist/Delta');

describe('stringify and parse', function () {
  it('insert number', function () {
    var a = new Delta().insert(2)
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
  it('insert number with attributes', function () {
    var a = new Delta().insert(2, { a: 'a' })
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })

  it('insert string', function () {
    var a = new Delta().insert('abc')
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
  it('insert string with attributes', function () {
    var a = new Delta().insert('abc', { a: 'a' })
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })

  it('insert delta', function () {
    var a = new Delta().insert(new Delta().insert(3))
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
  it('insert delta with attributes', function () {
    var a = new Delta().insert(new Delta().insert(3), { a: 'a' })
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })

  it('retain number', function () {
    var a = new Delta().retain(2)
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
  it('retain number with attributes', function () {
    var a = new Delta().retain(2, { a: 'a' })
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })

  it('retain delta', function () {
    var a = new Delta().retain(new Delta().retain(3))
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
  it('retain delta with attributes', function () {
    var a = new Delta().retain(new Delta().retain(3), { a: 'a' })
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })

  it('delete number', function () {
    var a = new Delta().delete(2)
    var b = Delta.parse(Delta.stringify(a))
    expect(a).toEqual(b)
  })
})
