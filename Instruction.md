## Introduction
[Quill](https://quilljs.com/) is a very popular rich text editor. It has very powerful extension capabilities, allowing developers to write plug-ins according to their needs, and enrich the content types supported by the editor. The reason why it can have such a powerful expansion capability is that on the one hand, its architecture and api design have fully considered the need for expansion from the beginning, and on the other hand, it uses a highly expressive data store model -- [quill-delta](https://github.com/quilljs/delta).

Quill-delta is an implementation of the ot algorithm. The so-called ot algorithm refers to Operational Transformation. This algorithm is mainly used to solve the problem of collaborative editing of data. However, because the algorithm itself does not target a specific type of data format, its adaptability is very strong. , So the quill-delta expression ability based on this algorithm is also very good. There is too much content about the ot algorithm to expand. This article is not intended to be covered. If you are interested, you can search for it.

However, quill-delta may be more concerned with the use of simple document type data, so its data is basically linear, and the ability to support data in the tree structure is weak, which also brings him a lot of uses Limitations on the scene. In order to solve this problem, I made some modifications and extensions to quill-delta, that is **[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)**. This article will introduce the design ideas of **[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)** , as well as the problems and solutions during implementation.
## Quill-delta' problems
The advantage of quill-delta is that it is simple and easy to understand. Take a few minutes to read the api document, you can understand how it works. But there are also some problems, that is, the ability to express is not strong enough, for example, how to represent a table? Embedding a table in a document is actually a very common requirement. A table can have several rows, and each row can have several cells. Cells can also be merged. The content in each cell will also be very different. Some editors also provide table nesting, which is to nest one table in another. For such complex nested data, quill-delta seems to be a bit powerless, so Quill has never supported the operation of inserting tables.
## How to enhance the expression of quill-delta
So how to improve the expressiveness of quill-delta? One idea that came to my mind was to nest deltas -- since the contents of the table are intuitively nested, why not design deltas to be nestable as well?

In fact, quill-delta does not only support data of type string, but also number and object, such as：
``` javascript
// string
new Delta().insert('hello world')
// number
new Delta().insert(3, {attr: 'number attributes'})
// object
new Delta().insert({name: 'tiger'})
```
Obviously, since quill-delta supports data of object type, it can certainly support the insertion of delta type, since delta itself is an object, so we can insert such data:
``` javascript
// embed delta
new Delta().insert(new Delta().insert('embed'))
```
Of course, there are still some details to deal with. For example, the compose, invert, and transform methods all need some changes to adapt to the practice of embedding deltas. For details, you can read the source code.
## How to diff nested delta
The diff method in quill-delta can compare the differences between two deltas very quickly, such as:
``` javascript
var a = new Delta().insert('hello world')
var b = new Delta().insert('hi word')

a.diff(b)
// new Delta().retain(1).insert('i').delete(4).retain(4).delete(1)
```
If you have read the code of quill-delta, you know that quill-delta uses a library called [fast-diff](https://github.com/jhchen/fast-diff/) to implement the diff algorithm. The fast-diff can only be used to process diffs of string data. So how does quill-delta use it to process data of string, number, and object? Still read the source code:
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
Quill-delta converts all insert operations into strings before calling fast-diff. For inserted number and object, it is converted into a special character, and then concat with string data together, it becomes a large string, which is then processed by fast-diff. However, there is a very obvious problem here. If two different objects are inserted into two deltas, because the objected are all converted to the same special character, fast-diff cannot find the two objects' difference, so quill-delta did further processing after getting the fast-diff processing result:
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
As shown above, for what fast-diff considers to be the same, quill-delta does another equal operation to confirm whether the two contents are really the same. If they are really the same, they are retained, and if they are not, they are roughly deleted and inserts new content. This obviously can not get a relatively reasonable diff result, such as:
``` javascript
var a = new Delta().insert(3)
var b = new Delta().insert(2).insert(3)

a.diff(b)
// new Delta().insert(2).delete(1).insert(3)
```
For data of type number, deleting the original content directly and inserting new content does not seem to have much impact, but if a complex object data or delta is inserted, this operation seems too inefficient, so after delta supports nesting, improvements must be made to the diff algorithm.
## Improved quill-delta's diff algorithm
If the delta is inserted as a string, the entire delta can be regarded as a linear data structure. When we allow delta to nest another delta, the delta will become a tree structure, which will brings great challenges to our diff algorithm.

The time complexity of the traditional tree diff algorithm is O (n ^ 3). That is to say, for a 1000-node tree, diff requires 1 billion rounds of operations at a time. Such overhead is obviously unacceptable. But this question reminded me of a very, very, very famous library: React. React is used to diff the virtual dom to generate the minimum operation for the dom, to achieve the purpose of not operating the dom as much as possible to improve performance. We know that virtual dom is actually a kind of complex tree structure data. The complexity of this tree is generally more complicated than the delta structure. So how does React achieve efficient diff? You can search for it yourself. There are so many articles explaining the diff algorithm in React on the Internet. I only mention here that React's optimization of the diff algorithm is actually a strategy optimization, which is to optimize performance by limiting the scenario. There are four main points: hierarchical comparison, type judgment, shouldComponentUpdate optimization, and key optimization. Through these four optimization points, React reduced the time complexity of tree diff from O (n ^ 3) to O (n), the effect is very significant. So can these four optimization strategies be used in the delta diff algorithm? I think at least two of them are okay.

First of all, hierarchical comparison. That is to say, we think that moving a subtree from one node to another is not a common operation. The diff is only performed between elements at the same level, without considering the subtree moving between nodes. This scenario greatly simplifies the computational complexity. for example:
``` javascript
var a = new Delta()
  .insert(new Delta().insert('a').insert(1))
  .insert(new Delta().insert('b'))
var b = new Delta()
  .insert(new Delta().insert('a'))
  .insert(new Delta().insert('b').insert(1))
```
When these two deltas are diff, we will not see if the insert (1) operation under the second sub-delta in b has existed in some sub-delta in a, but only the first sub-delta in b. One, two, and two child deltas are compared with the first, two, and two child deltas in a, respectively.

Second, key optimization. For elements of the same level and type in react, the uniqueness of the element is marked with a unique key at that level. This key is used to determine which element is new and which element has existed before. such as:
``` javascript
var a = new Delta()
  .insert(new Delta().insert('a'))
var b = new Delta()
  .insert(new Delta().insert('b'))
  .insert(new Delta().insert('a'))
```
If the above two deltas do not use keys to mark uniqueness, it is likely that the result of diff will be:
``` javascript
new Delta()
  .retain(new Delta().insert('b').delete(1))
  .insert(new Delta().insert('a'))
```
Because there is no key to mark the sub-delta that already exists in a, when diff, the program can only compare the first sub-delta in b with the sub-delta in a, and then obtain the retain operation in the result. And if we can add a unique key to the child delta to mark it, when diff, we can easily determine which deltas existed by the key. To get the correct result:
``` javascript
new Delta()
  .insert(new Delta().insert('b'))
```
## Idea of modification
Talking about the optimization strategy, let's talk about how to achieve it. Let's just talk about ideas. Let's look at the commit records on git for the specific modified code.
First of all, fast-diff is a very useful diff algorithm library. I hope to reuse it as much as possible, but after adding a key to the sub-delta, it is obviously impossible to convert the ops in the delta into pure string data as before. This requires fast-diff to support mixed types of diff, such as:
``` javascript
['abc', 1, 'defgh', 2, 'xyz']
```
The above data represents a delta with 5 segments of abc, a sub-delta with a key of 1, defgh, a sub-delta with a key of 2, and finally xyz. Fortunately, the modification of fast-diff is not very complicated. You can imagine that although fast-diff is used to process string data, in fact, string type is very similar to array. We can imagine string as An array of type char (usually used to store strings in C language), so it is not very complicated to modify. You can refer to this commit:[enhance diff to support diff sequence of characters and numbers](https://github.com/SilentTiger/quill-delta-enhanced/commit/424cf076dea092a90bb1ec695732879c741e2e7e)

After fast-diff supports such an array of mixed string and numeric data, the logical modification of quill-delta's own diff is relatively simple. It is mainly to add a number type key parameter to the insert interface and handle fast-diff. The result requires a little special treatment, refer to this commit:[Improve diff algorithm, support efficient diff of nested delta](https://github.com/SilentTiger/quill-delta-enhanced/commit/66c98644b7bea8bca98dda6723882855506a14ed)
## Others
**[quill-delta-enhanced](https://github.com/SilentTiger/quill-delta-enhanced)** also made some other changes, such as a slight modification of the data types supported by the insert and retain operations, and the meaning of the original number data has changed slightly. You can read the specific changes in [README](./README.md).
## In conclusion
quill-delta is a very concise and practical ot algorithm library. For simple document content, his expression ability is already very good, but after adding the ability of nested delta, its expression ability is further enhanced. Although nested deltas greatly increase the complexity of some logics, in fact, a calm analysis can still find some cost-effective solutions.


