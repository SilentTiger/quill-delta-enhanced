## 简介
[Quill](https://quilljs.com/) 是一款非常热门的富文本编辑器，它拥有非常强大的扩展能力，可以让开发者根据自己的需要编写插件，使编辑器支持的内容类型更加丰富。它之所以能够拥有这么强大的扩展能力，一方面是因为它的架构和 api 设计从一开始就充分考虑了扩展的需求，另一方面就是它底层采用了一种表达能力很强的的数据存储模型 —— [quill-delta](https://github.com/quilljs/delta)。

quill-delta 是一个 ot 算法的实现，所谓 ot 算法是指 Operational Transformation，这个算法主要是用来解决数据协同编辑的问题，但因为算法本身并不针对特定类型的数据格式，所以其适应性很强，因此基于此算法实现的 quill-delta 表达能力也很不错。关于 ot 算法如果要展开来讲内容太多了，本文不打算涉及，大家感兴趣可以去搜索一下。

但是，quill-delta 可能更多的还是考虑简单文档类型数据的使用场景，所以它的数据基本上都是线性的，对树状结构的数据支持能力很弱，这也给他带来了很多使用场景上的限制。为了解决这个问题，我对 quill-delta 做了一些改造和扩展，于是就有了 **[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)**。本文将介绍 **[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)** 的设计思路，以及实现过程中面临的问题及其解决方案。
## quill-delta 的问题
quill-delta 的优点是简单易于理解，花上几分钟看看 api 文档你就能理解它的工作方式。但简单也有简单的问题，就是表达能力不够强，比如，如何表示一个表格？在文档中嵌入表格其实也算是非常常见的需求，一个表格可以有若干行，每行又可以有若干个单元格，单元格还可以合并，每个单元格里面的内容也会非常不一样，甚至有的编辑器还提供了表格嵌套功能，就是一个表格中嵌套另一个表格。对于这样复杂嵌套的数据，quill-delta 就显得有些力不从心了，所以 Quill 一直没有支持插入表格的操作。
## 如何增强 quill-delta 的表达能力
那么如何提升 quill-delta 的表达能力呢？我想到的一个思路是，嵌套 delta —— 既然表格的内容在直观上是嵌套的，那么为什么不把 delta 也设计成可以嵌套的样子呢？

事实上 quill-delta 本身并不仅仅支持 string 类型的数据，还支持 number 类型和 object 类型的数据，比如：
``` javascript
// string
new Delta().insert('hello world')
// number
new Delta().insert(3, {attr: 'number attributes'})
// object
new Delta().insert({name: 'tiger'})
```
很明显，既然 quill-delta 支持 object 类型的数据，就肯定也可以支持插入 delta 类型的数据，毕竟 delta 本身就是一种 object，所以，我们可以插入这样的数据：
``` javascript
// embed delta
new Delta().insert(new Delta().insert('embed'))
```
当然，这里面还有些细节需要处理，比如 compose、invert 和 transform 方法都需要一些变化才能适应嵌入 delta 的做法，具体内容大家可以看源代码。
## 嵌套 delta 如何 diff
在 quill-delta 中 diff 方法可以非常快速地比较两条 delta 之间的差异，比如：
``` javascript
var a = new Delta().insert('hello world')
var b = new Delta().insert('hi word')

a.diff(b)
// new Delta().retain(1).insert('i').delete(4).retain(4).delete(1)
```
如果你看过 quill-delta 的代码，就知道 quill-delta 是用了一个叫做 [fast-diff](https://github.com/jhchen/fast-diff/) 的库来实现 diff 算法的。fast-diff 这个库只能用来处理 string 类型数据的 diff，那 quill-delta 是怎么用它来处理同时包含 string、number、object 三种类型的数据呢？还是看源码：
``` javascript
const NULL_CHARACTER = String.fromCharCode(0); // Placeholder char for embed in diff()

diff(other: Delta, cursor ?: number | diff.CursorInfo): Delta {
  // ....

  const strings = [this, other].map(delta => {
    return delta
      .map(op => {
        if (op.insert != null) {
          return typeof op.insert === 'string' ? op.insert : NULL_CHARACTER;
        }
        const prep = delta === other ? 'on' : 'with';
        throw new Error('diff() called ' + prep + ' non-document');
      })
      .join('');
  });

  // ....
}
```
quill-delta 在调用 fast-diff 之前把所有的 insert 操作全部转成了字符串，对于插入的 number 类型的数据和 object 类型的数据，都转成了一个特殊字符，然后和 string 类型的数据拼在一起，就成了一个大字符串，然后给 fast-diff 处理。但是，这里有一个很明显的问题，如果两个 delta 中分别插入了两个不同的 object，由于这里 diff 的时候全都转成同一个特殊字符了，那么 fast-diff 就无法找出这两个 object 的不同，所以 quill-delta 在拿到 fast-diff 的处理结果之后又做了进一步处理：
``` javascript
const diffResult = diff(strings[0], strings[1], cursor);

diffResult.forEach(component => {
  //....
  switch (component[0]) {
    // ....
    case diff.EQUAL:
      // ....
      if (equal(thisOp.insert, otherOp.insert)) {
        retDelta.retain(
          opLength,
          AttributeMap.diff(thisOp.attributes, otherOp.attributes),
        );
      } else {
        retDelta.push(otherOp).delete(opLength);
      }
      break;
  }
  // ....
})
```
如上所示，对于 fast-diff 认为是相同的内容，quill-delta 又做了一次 equal 操作来确认两条内容是不是真的相同，如果是真的相同就 retain，如果不是就粗暴的删除之前的内容插入新的内容。这样显然不能得到一个相对合理的 diff 结果，比如：
``` javascript
var a = new Delta().insert(3)
var b = new Delta().insert(2).insert(3)

a.diff(b)
// new Delta().insert(2).delete(1).insert(3)
```
对于 number 类型的数据来说，直接删除原来的内容在插入新的内容似乎影响也不太大，但如果插入的是一个复杂的 object 数据或者 delta，这种操作就显得太低效了，所以在 delta 支持嵌套后，必须对 diff 算法做出改进。
## 改进 quill-delta 的 diff 算法
delta 中插入的如果都是 string 类型，那么整个 delta 可以近似看做是一个线性的数据结构，可当我们让 delta 可以嵌套另一个 delta 的时候，delta 就会变成一个树形结构，这会给我们的 diff 算法带来非常大的挑战。

传统的 tree diff 算法时间复杂度是 O(n^3)，就是说，对于一个 1000 个节点的树，diff 一次需要进行 10 亿轮运算，这样的开销显然是不可接受的。但这个问题让我想到了一个非常非常非常著名的库：react。react 中用对 virtual dom 进行 diff，来生成针对 dom 的最小操作，达到尽量不操作 dom 的目的从而提升性能。我们知道 virtual dom 其实也是一种复杂的树结构数据，这种树的复杂程度一般要比 delta 的结构更复杂，那么 react 是怎么实现高效 diff 的呢？大家可以自行搜索一下，网上讲解 react 中 diff 算法的文章多如牛毛。我这里只提一下 react 对 diff 算法的优化其实是一种策略优化，就是通过限制场景来优化性能，主要是四点：分级比较、类型判断、 shouldComponentUpdate 优化、key 优化。通过这四点优化，react 将 tree diff 的时间复杂度从 O(n^3) 降低到了 O(n)，效果非常显著。那么这四个优化策略是不是可以用在 delta 的 diff 算法上呢？我觉得至少其中两点是可以的。

首先，分级比较。就是说我们认为把一颗子树从一个节点下挪到另外一个节点下，这并不是一个常见的操作，diff 仅仅在同级别的元素之间进行，而不去考虑子树在节点之间挪动的场景，这样就大大简化了计算的复杂程度。举个例子：
``` javascript
var a = new Delta()
  .insert(new Delta().insert('a').insert(1))
  .insert(new Delta().insert('b'))
var b = new Delta()
  .insert(new Delta().insert('a'))
  .insert(new Delta().insert('b').insert(1))
```
这两条 delta 在做 diff 的时候，我们并不会去看 b 中的第二个子 delta 下的 insert(1) 操作是不是在 a 中的某个子 delta 中存在过，而仅仅将 b 中的第一、二两条子 delta 分别和 a 中的第一、二两条子 delta 做内容上的对比。

其次，key 优化。react 中对于同级别且同类型的元素会用一个该层级下唯一的 key 来标记元素的唯一性，通过这个 key 来判断哪个元素是新增的，哪个元素是之前就存在的。比如：
``` javascript
var a = new Delta()
  .insert(new Delta().insert('a'))
var b = new Delta()
  .insert(new Delta().insert('b'))
  .insert(new Delta().insert('a'))
```
上面这两条 delta 如果不用 key 来标记唯一性的话，很可能 diff 出来的结果会是这样：
``` javascript
new Delta()
  .retain(new Delta().insert('b').delete(1))
  .insert(new Delta().insert('a'))
```
因为没有 key 来标记 a 中已经存在的子 delta，在 diff 的时候，程序只能拿 b 中的第一条子 delta 和 a 中的子 delta 对比，于是得到了结果中的 retain 操作。而如果我们能给子 delta 添加一个唯一的 key 来标记它，diff 的时候就可以通过 key 很容易地判断出哪些 delta 是之前就存在的。从而得到正确的结果：
``` javascript
new Delta()
  .insert(new Delta().insert('b'))
```
## 修改思路
谈了优化策略，我们再来讲讲具体如何实现。还是只讲思路，具体修改的代码大家自己看 git 上的提交记录吧。
首先，fast-diff 是一个非常好用的 diff 算法库，我希望能尽量复用他，但是子 delta 添加 key 之后，显然就没法像之前那样把 delta 里的 op 都转成纯 string 类型的数据了，这就要求 fast-diff 能支持混合类型的 diff，比如
``` javascript
['abc', 1, 'defgh', 2, 'xyz']
```
上面的数据代表了一条 delta ，其中有 5 段内容分别是 abc、一条 key 为 1 的子 delta、defgh、一条 key 为 2 的子 delta，最后是 xyz。好在对 fast-diff 的修改其实并没有很复杂，大家可以想象一下，fast-diff 虽然是用来处理 string 类型的数据的，但其实 string 类型和 array 是非常类似的，我们可以把 string 想象成一个 char 类型的 array（一般C 语言里面就是这么来存储字符串的），所以修改起来并不算很复杂，大家可以参考这个提交：[enhance diff to support diff sequence of characters and numbers](https://github.com/SilentTiger/quill-delta-enhanced/commit/424cf076dea092a90bb1ec695732879c741e2e7e)

在 fast-diff 支持了这种字符串和数字类型数据混标的 array 之后，quill-delta 自身的 diff 逻辑修改就相对简单了，主要是要给 insert 接口添加 number 类型的 key 参数，以及处理 fast-diff 的结果的时候需要一点点特殊处理，参考这个提交：[Improve diff algorithm, support efficient diff of nested delta](https://github.com/SilentTiger/quill-delta-enhanced/commit/66c98644b7bea8bca98dda6723882855506a14ed)
## 其他
**[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)** 对还做了一些其他的改动，比如 insert 和 retain 操作支持的数据类型有稍作修改，原有的 number 类型的数据的含义也有些许变化，具体变化的内容大家可以在代码仓库的 [README](./README.ZH-CN.md) 文档中查看。
## 总结
quill-delta 是一个非常简洁实用的 ot 算法库，对于简单文档内容来说，他的表达能力已经很不错了，不过加入了嵌套 delta 的能力之后，其表达能力进一步增强。虽然嵌套 delta 让有些逻辑的复杂度大大增加，但其实冷静分析还是可以找到一些性价比很高的解决办法的。


