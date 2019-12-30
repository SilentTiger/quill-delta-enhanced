var Delta = require('../../dist/Delta');

function getInvertRes(a, b) {
  var composeRes = a.compose(b)
  var invertDelta = b.invert(a)
  var invertRes = composeRes.compose(invertDelta)
  return invertRes
}

describe('invert()', function () {
  it('empty delta', function () {
    var a = new Delta()
    var b = new Delta()
    expect(a).toEqual(getInvertRes(a, b))
  })

  it('number + delta', function () {
    var a = new Delta().insert(1, { attr: 'attr' })
    var b = new Delta().retain(new Delta().insert('b'))
    var i = getInvertRes(a, b)
    expect(a).toEqual(getInvertRes(a, b))
  })
})
