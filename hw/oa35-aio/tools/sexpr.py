"""Minimal KiCad S-expression reader/writer."""
import re


class Sym(str):
    """A bare symbol (unquoted atom)."""
    __slots__ = ()


TOKEN = re.compile(r'''\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))''')


def parse(text):
    pos = 0
    stack = [[]]
    n = len(text)
    while pos < n:
        m = TOKEN.match(text, pos)
        if not m:
            break
        pos = m.end()
        if m.group(1):
            new = []
            stack[-1].append(new)
            stack.append(new)
        elif m.group(2):
            stack.pop()
        elif m.group(3) is not None:
            s = m.group(3)
            s = s.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
            stack[-1].append(s)
        else:
            tok = m.group(4)
            stack[-1].append(Sym(tok))
    return stack[0][0]


def _q(s):
    return '"' + str(s).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'


def dumps(node, indent=0, inline=False):
    pad = '' if inline else '  ' * indent
    if not isinstance(node, list):
        return pad + (str(node) if isinstance(node, Sym) else _q(node))
    if not node:
        return pad + '()'
    head = node[0]
    parts = []
    simple = all(not isinstance(x, list) for x in node)
    if simple:
        for x in node:
            parts.append(str(x) if isinstance(x, Sym) else _q(x))
        return pad + '(' + ' '.join(parts) + ')'
    out = [pad + '(' + (str(head) if isinstance(head, Sym) else _q(head))]
    i = 1
    # keep leading scalars on the head line
    while i < len(node) and not isinstance(node[i], list):
        x = node[i]
        out[0] += ' ' + (str(x) if isinstance(x, Sym) else _q(x))
        i += 1
    for x in node[i:]:
        out.append(dumps(x, indent + 1))
    out[-1] += ')'
    return '\n'.join(out)


def find_all(node, name):
    return [x for x in node if isinstance(x, list) and x and x[0] == name]


def find(node, name):
    for x in node:
        if isinstance(x, list) and x and x[0] == name:
            return x
    return None


def S(*args):
    return list(args)
