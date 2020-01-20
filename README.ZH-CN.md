# QUILL DELTA ENHANCED

#### [English](./README.md) 中文版

支持嵌套 delta 的 quill-delta。
如果你对 quill-delta 的基本概念还不熟悉，可以阅读 quill-delta 的 [README](https://github.com/quilljs/delta/blob/master/README.md) 文档

## 动机
quill-delta 基本上只能用来管理扁平的文档数据，对于层级复杂的文档内容则无能为力，而像 Word 就可以在文档中嵌入表格和文本框，且表格和文本框中又可以再嵌入结构复杂的文档内容。为了让 quill-delta 也可以实现对复杂嵌套数据的管理，就有了 quill-delta-enhanced。

## 变更内容
### 扩展 insert 操作
quill-delta 原有的 insert 操作可以插入 string、number、object 三种类型的数据，在此基础上，添加了 delta 类型，比如：
```javascript
var embedContent = new Delta().insert('embed')
var doc = new Delta().insert(embedContent)
```
无论 embedContent 的内容多么复杂，对 doc 来说，插入的 embedContent 长度始终为 1。
另外还给 insert 操作添加了 number 类型的 key 属性，用来标记唯一的 insert 操作，key 的作用可以参考下面介绍新 diff 算法的部分

### 扩展 retain 操作
quill-delta 原有的 retain 操作只能是 number 类型，在此基础上，添加了 delta 类型，比如：
```javascript
var embedContent = new Delta().insert('embed')
var doc = new Delta().insert(embedContent)
// {ops:[{insert: {ops:[{insert: "embed"}]} }]}

var modifyEmbedAttr = new Delta().retain(5, { bold:true })
var modifyAttr = new Delta().retain(modifyEmbedAttr)

doc.compose(modifyAttr)
// {ops:[{insert: {ops:[{insert: "embed", attributes: {bold: true}}]} }]}
```
新增的 delta 类型的 retain 操作指对当前位置长度为 1 的内容应用这条 delta 操作，比如上例中，modifyEmbedAttr 就被应用到了 embedContent 上。
这种 delta 类型的 retain 操作只能和 number 类型和 delta 类型的数据进行 compose。

### 修改 insert number 操作
quill-delta 原有的 insert 操作在插入 number 类型的数据时，不论 number 的值是多少，其长度都是 1，比如：
```javascript
var delta1 = new Delta.insert(1)
delta1.length() // 1

var delta2 = new Delta.insert(5)
delta2.length() // 1
```
这是因为 quill-delta 将 number 类型的数据仅仅看做一个不可拆分的数据，而没并有“理解”数据内容，这样大大限制了 number 类型的用途，所以修改后，insert number 类型的操作会被 quill-delta-enhanced 理解为插入 n 个数据，即长度为 n，比如：
```javascript
var delta1 = new Delta.insert(1)
delta1.length() // 1

var delta2 = new Delta.insert(5)
delta2.length() // 5
```

### 删除 insert object 操作
quill-delta 原有的 insert 操作可以插入 object 类型的数据，如：
```javascript
var delta = new Delta().insert({embedData: 'embed'})
```
在 quill-delta-enhanced 中将不再支持这种类型的操作，即 insert 操作只支持 string、number、delta 三种类型的数据。
不过，如上所述，我修改了 insert number 操作的含义，所以 insert object 类型的操作完全可以用 insert number 来代替，如：
```javascript
// 原来的写法
var insertImage = new Delta().insert({src: 'http://xxxx.xx/xx.jpg'})

// 修改后的写法
var insertImage = new Delta().insert(1, {src: 'http://xxxx.xx/xx.jpg'})
// 甚至你可以连续插入 5 张图片
var insertFiveImages = new Delta().insert(5, {src: 'http://xxxx.xx/xx.jpg'})
```

### 修改了 diff 算法
quill-delta 原有的 diff 算法只能对字符串做 diff 计算，因此使用场景非常受限而且计算出的结果往往不是最优。这是因为 quill-delta 的 diff 算法底层是使用了 fast-diff 这个 npm 包，这个包只支持字符串 diff。设想如下的场景
``` javascript
var a = new Delta().insert(new Delta().insert('a'))
var b = new Delta().insert(new Delta().insert('b')).insert(new Delta().insert('a'))
```
按照 quill-delta 原有的 diff 逻辑，这两个 delta 的 diff 结果会是
``` javascript
new Delta().retain(new Delta().insert('b').delete(1)).insert(new Delta().insert('a'))
```
具体原因可以去参考 quill-delta 的源码。
为了解决这个问题，我在 insert 操作中引入了一个新的属性：key，用来标记唯一的 insert 操作，这样当两条 delta 中包含有 key 相同的的 insert 操作时，quill-delta-enhanced 就知道这两条操作时同一条操作，如果这条操作的数据本身没有变化，那么就不会出现先把这条操作删掉又重新插入的情况，上面的场景在 quill-delta-enhanced 中 diff 结果会成为：
``` javascript
var a = new Delta().insert(new Delta().insert('a'), null, 1)
var b = new Delta().insert(new Delta().insert('b'), null, 2).insert(new Delta().insert('a'), null, 1)

var expected = new Delta().insert(new Delta().insert('b'))
```
更复杂的场景可以参考仓库中的 testcase

就酱啦