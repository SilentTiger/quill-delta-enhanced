# QUILL DELTA ENHANCED

For more instructions, please read [Instruction](./Instruction.md).
#### English    [中文版](./README.ZH-CN.md)

quill-delta with DELTA EMBED support.
If you want to know the basic concept of delta, please read the [README](https://github.com/quilljs/delta/blob/master/README.md) of quill-delta.

## Motivation
Quill-delta can basically only be used to manage flat document data. It is powerless for document contains complex levels. But such as Microsoft Word, you can embed tables and text boxes in documents, and then embed complex document content in tables and text boxes. In order for quill-delta to manage complex embed data, there is QUILL-DELTA-ENHANCED.

## Changes
### enhance insert operator
The original insert operation of quill-delta can insert three types of data: string, number, and object. On this basis, delta types are added, such as:

```javascript
var embedContent = new Delta().insert('embed')
var doc = new Delta().insert(embedContent)
```

No matter how complicated the content of embedContent is, for doc, the length of embedContent is always 1.
In addition, a number type 'key' attribute has been added to the insert operation to mark the unique insert operation. For the role of the key, refer to the part that introduces the new diff algorithm below.

### enhance retain operator
The original retain operation of quill-delta can only be of type number. On this basis, a delta type is added, for example:

```javascript
var embedContent = new Delta().insert('embed')
var doc = new Delta().insert(embedContent)
// {ops:[{insert: {ops:[{insert: "embed"}]} }]}

var modifyEmbedAttr = new Delta().retain(5, { bold:true })
var modifyAttr = new Delta().retain(modifyEmbedAttr)

doc.compose(modifyAttr)
// {ops:[{insert: {ops:[{insert: "embed", attributes: {bold: true}}]} }]}
```

The new delta type retain operation refers to applying the delta operation to the content whose length is 1 at the current position. In the above example, modifyEmbedAttr is applied to the embedContent.
This delta type retain operation can only compose with data of type number and delta.

### modify insert number operator
When the original insert operation of quill-delta inserts data of type number, its length is 1 regardless of the value of number. Such as:

```javascript
var delta1 = new Delta.insert(1)
delta1.length() // 1

var delta2 = new Delta.insert(5)
delta2.length() // 1
```

This is because quill-delta only considers the data of type number as an indivisible data, and does not “understand” the data content, which limits the use of number type. Therefore, the operator of insert number type after modification will It is understood by quill-delta-enhanced to insert n data, that is, the length is n, for example:

```javascript
var delta1 = new Delta.insert(1)
delta1.length() // 1

var delta2 = new Delta.insert(5)
delta2.length() // 5
```

### remove insert object operator
The original insert operation of quill-delta can insert data of type object, such as:

```javascript
var delta = new Delta().insert({embedData: 'embed'})
```

This type of operation will no longer be supported in quill-delta-enhanced, that is, the insert operator only supports three types of data: string, number, and delta.
However, as mentioned above, I have modified the meaning of the insert number operation, so insert object type operations can be replaced with insert number, such as:

```javascript
// used before
var insertImage = new Delta().insert({src: 'http://xxxx.xx/xx.jpg'})

// now
var insertImage = new Delta().insert(1, {src: 'http://xxxx.xx/xx.jpg'})
// You can even insert 5 pictures in a row
var insertFiveImages = new Delta().insert(5, {src: 'http://xxxx.xx/xx.jpg'})
```

### modified diff algorithm
quill-delta's original diff algorithm can only perform diff calculations on strings, so the use scenarios are very limited and the calculated results are often not optimal. This is because quill-delta's diff algorithm uses the npm package fast-diff at the bottom. This package only supports string diff. Imagine the following case
``` javascript
var a = new Delta().insert(new Delta().insert('a'))
var b = new Delta().insert(new Delta().insert('b')).insert(new Delta().insert('a'))
```
According to the original diff logic of quill-delta, the diff result of these two deltas will be
``` javascript
new Delta().retain(new Delta().insert('b').delete(1)).insert(new Delta().insert('a'))
```
For specific reasons, you can refer to the source code of quill-delta.
In order to solve this problem, I introduced a new attribute in the insert operation: key, which is used to mark the unique insert operation, so that when two deltas contain an insert operation with the same key, quill-delta-enhanced will know These two operations are the same operation. If the data of this operation has not changed, then the situation of deleting and reinserting this operation will not occur. The above scenario will result in diff in quill-delta-enhanced. become:
``` javascript
var a = new Delta().insert(new Delta().insert('a'), null, 1)
var b = new Delta().insert(new Delta().insert('b'), null, 2).insert(new Delta().insert('a'), null, 1)

var expected = new Delta().insert(new Delta().insert('b'))
```
More complex scenarios can refer to the testcase in the repository

Have fun!