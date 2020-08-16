// This source code is free for use in the public domain.
// NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

// based on http://code.google.com/p/json-sans-eval/
// (retrieved as of 21 Mar 2012)

/**
 * Parses a first JSON object in a string, returning it and the index of
 * the first character past the object.
 *
 * If there is only part of a JSON object, it will return [undefined, 0].
 *
 * If there is malformed JSON, the behavior is undefined. It may throw
 * an Error, but it may just return [undefined, 0] or an incorrect
 * object. However, it is deterministic and is guaranteed not to
 * modify any object other than its return value.
 *
 * This does not use `eval` so is less likely to have obscure security bugs than
 * json2.js.
 * It is optimized for speed, so is much faster than json_parse.js.
 *
 * This library should be used whenever security is a concern (when JSON may
 * come from an untrusted source), speed is a concern, and erroring on malformed
 * JSON is *not* a concern.
 *
 *                      Pros                   Cons
 *                    +-----------------------+-----------------------+
 * json_sans_eval.js  | Fast, secure          | Not validating        |
 *                    +-----------------------+-----------------------+
 * json_parse.js      | Validating, secure    | Slow                  |
 *                    +-----------------------+-----------------------+
 * json2.js           | Fast, some validation | Potentially insecure  |
 *                    +-----------------------+-----------------------+
 *
 * json2.js is very fast, but potentially insecure since it calls `eval` to
 * parse JSON data, so an attacker might be able to supply strange JS that
 * looks like JSON, but that executes arbitrary javascript.
 * If you do have to use json2.js with untrusted data, make sure you keep
 * your version of json2.js up to date so that you get patches as they're
 * released.
 *
 * @param {string} 0 or more json text representations per RFC 4627;
 *     the last may be incomplete
 *
 * @param {function (this:Object, string, *):*} opt_reviver optional function
 *     that reworks JSON objects post-parse per Chapter 15.12 of EcmaScript3.1.
 *     If supplied, the function is called with a string key, and a value.
 *     The value is the property of 'this'.  The reviver should return
 *     the value to use in its place.  So if dates were serialized as
 *     {@code { "type": "Date", "time": 1234 }}, then a reviver might look like
 *     {@code
 *     function (key, value) {
 *       if (value && typeof value === 'object' && 'Date' === value.type) {
 *         return new Date(value.time);
 *       } else {
 *         return value;
 *       }
 *     }}.
 *     If the reviver returns {@code undefined} then the property named by key
 *     will be deleted from its container.
 *     {@code this} is bound to the object containing the specified property.
 *
 * @return [{Object|Array|{@code undefined}}, Number]: The first object in the
 *     stream, and the index of the first character beyond that object.
 * @author Mike Samuel <mikesamuel@gmail.com>, Andrew Barnert <abarnert@yahoo.com>
 */
var jsonRawDecode = (function() {
  var number =
    '(?:-?\\b(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\\b)';
  var oneChar =
    '(?:[^\\0-\\x08\\x0a-\\x1f"\\\\]' +
    '|\\\\(?:["/\\\\bfnrt]|u[0-9A-Fa-f]{4}))';
  var string = '(?:"' + oneChar + '*")';

  // Will match a value in a well-formed JSON file.
  // If the input is not well-formed, may match strangely, but not in an unsafe
  // way.
  // Since this only matches value tokens, it does not match whitespace, colons,
  // or commas.
  var jsonToken = new RegExp(
    '(?:false|true|null|[\\{\\}\\[\\]]' + '|' + number + '|' + string + ')',
    'g',
  );

  // Similar to the built-in match, but returns an array of match
  // objects instead of an array of strings.
  function tokenize(re, s) {
    var matches = [];
    while (true) {
      var match = re.exec(s);
      if (match == null) return matches;
      matches.push(match);
    }
  }

  // Matches escape sequences in a string literal
  var escapeSequence = new RegExp('\\\\(?:([^u])|u(.{4}))', 'g');

  // Decodes escape sequences in object literals
  var escapes = {
    '"': '"',
    '/': '/',
    '\\': '\\',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };
  function unescapeOne(_, ch, hex) {
    return ch ? escapes[ch] : String.fromCharCode(parseInt(hex, 16));
  }

  // A non-falsy value that coerces to the empty string when used as a key.
  var EMPTY_STRING = new String('');
  var SLASH = '\\';

  // Constructor to use based on an open token.
  var firstTokenCtors = {'{': Object, '[': Array};

  var hop = Object.hasOwnProperty;

  return function(json, opt_reviver) {
    // Split into tokens
    var toks = tokenize(jsonToken, json);
    if (!toks || !toks.length) {
      return [undefined, 0];
    }
    // Construct the object to return
    var result;
    var tok = toks[0].toString();
    var topLevelPrimitive = false;
    if ('{' === tok) {
      result = {};
    } else if ('[' === tok) {
      result = [];
    } else {
      // The RFC only allows arrays or objects at the top level, but the JSON.parse
      // defined by the EcmaScript 5 draft does allow strings, booleans, numbers, and null
      // at the top level.
      result = [];
      topLevelPrimitive = true;
    }

    var index = -1;

    // If undefined, the key in an object key/value record to use for the next
    // value parsed.
    var key;
    // Loop over remaining tokens maintaining a stack of uncompleted objects and
    // arrays.
    var stack = [result];
    for (var i = 1 - topLevelPrimitive, n = toks.length; i < n; ++i) {
      tok = toks[i].toString();

      var cont;
      switch (tok.toString().charCodeAt(0)) {
        default:
          // sign or digit
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          cont[key || cont.length] = +tok;
          key = void 0;
          break;
        case 0x22: // '"'
          tok = tok.substring(1, tok.length - 1);
          if (tok.indexOf(SLASH) !== -1) {
            tok = tok.replace(escapeSequence, unescapeOne);
          }
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          if (!key) {
            if (cont instanceof Array) {
              key = cont.length;
            } else {
              key = tok || EMPTY_STRING; // Use as key for next value seen.
              break;
            }
          }
          cont[key] = tok;
          key = void 0;
          break;
        case 0x5b: // '['
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          stack.unshift((cont[key || cont.length] = []));
          key = void 0;
          break;
        case 0x5d: // ']'
          stack.shift();
          break;
        case 0x66: // 'f'
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          cont[key || cont.length] = false;
          key = void 0;
          break;
        case 0x6e: // 'n'
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          cont[key || cont.length] = null;
          key = void 0;
          break;
        case 0x74: // 't'
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          cont[key || cont.length] = true;
          key = void 0;
          break;
        case 0x7b: // '{'
          cont = stack[0];
          if (cont == undefined) {
            index = toks[i].index;
            break;
          }
          stack.unshift((cont[key || cont.length] = {}));
          key = void 0;
          break;
        case 0x7d: // '}'
          stack.shift();
          break;
      }
      if (index >= 0) break;
    }
    // Fail if we've got an uncompleted object.
    if (topLevelPrimitive) {
      if (stack.length !== 1) {
        return undefined, 0; // Incomplete top-level primitive
      }
      result = result[0];
    } else {
      if (stack.length) {
        return undefined, 0; // Incomplete top-level obj/array
      }
    }

    if (opt_reviver) {
      // Based on walk as implemented in http://www.json.org/json2.js
      var walk = function(holder, key) {
        var value = holder[key];
        if (value && typeof value === 'object') {
          var toDelete = null;
          for (var k in value) {
            if (hop.call(value, k) && value !== holder) {
              // Recurse to properties first.  This has the effect of causing
              // the reviver to be called on the object graph depth-first.

              // Since 'this' is bound to the holder of the property, the
              // reviver can access sibling properties of k including ones
              // that have not yet been revived.

              // The value returned by the reviver is used in place of the
              // current value of property k.
              // If it returns undefined then the property is deleted.
              var v = walk(value, k);
              if (v !== void 0) {
                value[k] = v;
              } else {
                // Deleting properties inside the loop has vaguely defined
                // semantics in ES3 and ES3.1.
                if (!toDelete) {
                  toDelete = [];
                }
                toDelete.push(k);
              }
            }
          }
          if (toDelete) {
            for (var i = toDelete.length; --i >= 0; ) {
              delete value[toDelete[i]];
            }
          }
        }
        return opt_reviver.call(holder, key, value);
      };
      result = walk({'': result}, '');
    }

    if (index == -1) index = json.length;
    return [result, index];
  };
})();

export function jsonDecode(jsonString, jsonObjList = []) {
  const out = jsonRawDecode(jsonString);
  if (out === 0) {
    // partial JSON string
    return jsonObjList;
  }

  const [jsonObj, nextIdx] = out;
  const nextJsonString = jsonString.substr(nextIdx);
  const nextJsonObjList = [...jsonObjList, jsonObj];

  if (nextJsonString === '') {
    return nextJsonObjList;
  }

  return jsonDecode(nextJsonString, nextJsonObjList);
}

/*
j0 = '{a:]}'
j05 = '{"id":1,"result":{"answer'
j1 = '{"id":1,"result":{"answer":23},"error":null}'
j15 = '{"id":1,"result":{"answer":23},"error":null}{"id":2,"result":{"answer';
j2 = '{"id":1,"result":{"answer":23},"error":null}{"id":2,"result":{"answer":42},"error":null}';
print(JSON.stringify(jsonRawDecode(j2)))
print(JSON.stringify(jsonRawDecode(j15)))
print(JSON.stringify(jsonRawDecode(j1)))
print(JSON.stringify(jsonRawDecode(j05)))
print(JSON.stringify(jsonRawDecode(j0)))
*/

export function decycle(object, replacer) {
  // 'use strict';

  // Make a deep copy of an object or array, assuring that there is at most
  // one instance of each object or array in the resulting structure. The
  // duplicate references (which might be forming cycles) are replaced with
  // an object of the form

  //      {"$ref": PATH}

  // where the PATH is a JSONPath string that locates the first occurance.

  // So,

  //      var a = [];
  //      a[0] = a;
  //      return JSON.stringify(JSON.decycle(a));

  // produces the string '[{"$ref":"$"}]'.

  // If a replacer function is provided, then it will be called for each value.
  // A replacer function receives a value and returns a replacement value.

  // JSONPath is used to locate the unique object. $ indicates the top level of
  // the object or array. [NUMBER] or [STRING] indicates a child element or
  // property.

  var objects = new WeakMap(); // object to path mappings

  return (function derez(value, path) {
    // The derez function recurses through the object, producing the deep copy.

    var old_path; // The path of an earlier occurance of value
    var nu; // The new object or array

    // If a replacer function was provided, then call it to get a replacement value.

    if (replacer !== undefined) {
      value = replacer(value);
    }

    // typeof null === "object", so go on if this value is really an object but not
    // one of the weird builtin objects.

    if (
      typeof value === 'object' &&
      value !== null &&
      !(value instanceof Boolean) &&
      !(value instanceof Date) &&
      !(value instanceof Number) &&
      !(value instanceof RegExp) &&
      !(value instanceof String)
    ) {
      // If the value is an object or array, look to see if we have already
      // encountered it. If so, return a {"$ref":PATH} object. This uses an
      // ES6 WeakMap.

      old_path = objects.get(value);
      if (old_path !== undefined) {
        return {$ref: old_path};
      }

      // Otherwise, accumulate the unique value and its path.

      objects.set(value, path);

      // If it is an array, replicate the array.

      if (Array.isArray(value)) {
        nu = [];
        value.forEach(function(element, i) {
          nu[i] = derez(element, path + '[' + i + ']');
        });
      } else {
        // If it is an object, replicate the object.

        nu = {};
        Object.keys(value).forEach(function(name) {
          nu[name] = derez(
            value[name],
            path + '[' + JSON.stringify(name) + ']',
          );
        });
      }
      return nu;
    }
    return value;
  })(object, '$');
}
