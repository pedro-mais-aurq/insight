export class MinimalDOMParser {
  parseFromString(source) {
    const document = new MinimalDocument();
    const stack = [document];
    const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];

    for (const token of tokens) {
      if (token.startsWith("<?") || token.startsWith("<!--") || token.startsWith("<!")) {
        continue;
      }

      if (token.startsWith("</")) {
        stack.pop();
        continue;
      }

      if (token.startsWith("<")) {
        const selfClosing = token.endsWith("/>");
        const content = token.slice(1, selfClosing ? -2 : -1).trim();
        const separator = content.search(/\s/);
        const nodeName = separator === -1 ? content : content.slice(0, separator);
        const attributeSource = separator === -1 ? "" : content.slice(separator + 1);
        const element = new MinimalElement(nodeName, parseAttributes(attributeSource));
        stack.at(-1).appendChild(element);

        if (!selfClosing) {
          stack.push(element);
        }

        continue;
      }

      const text = token.trim();

      if (text) {
        stack.at(-1).appendText(text);
      }
    }

    return document;
  }
}

class MinimalDocument {
  constructor() {
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
  }

  appendText() {}

  get documentElement() {
    return this.children[0] ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return selectAll(this.children, selector);
  }
}

class MinimalElement {
  constructor(nodeName, attributes) {
    this.nodeName = nodeName;
    this.attributes = attributes;
    this.children = [];
    this.ownText = "";
  }

  appendChild(child) {
    this.children.push(child);
  }

  appendText(text) {
    this.ownText += text;
  }

  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  getAttribute(name) {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return selectAll(this.children, selector);
  }
}

function selectAll(nodes, selector) {
  const parts = selector.trim().split(/\s+/);
  let matches = collectMatches(nodes, parts[0], true);

  for (let index = 1; index < parts.length; index += 1) {
    matches = matches.flatMap((node) => (
      collectMatches(node.children, parts[index], true)
    ));
  }

  return matches;
}

function collectMatches(nodes, selector, includeNodes) {
  const matches = [];

  for (const node of nodes) {
    if (includeNodes && node.nodeName === selector) {
      matches.push(node);
    }

    matches.push(...collectMatches(node.children, selector, true));
  }

  return matches;
}

function parseAttributes(source) {
  const attributes = [];
  const pattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  let match;

  while ((match = pattern.exec(source))) {
    attributes.push({
      name: match[1],
      value: match[2],
      specified: true
    });
  }

  return attributes;
}
