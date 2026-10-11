// The JS encounter host uses injected members that TypeScript cannot check.
// Catch stale this.foo reads after a merge removes their initialization.
export const declaredHostMembers = {
  meta: { type: 'problem', schema: [], messages: { missing: 'NPC host member "{{name}}" is never declared or assigned.' } },
  create(context) {
    const source = context.sourceCode;
    return {
      'ClassDeclaration:exit'(host) {
        if (host.id?.name !== 'NpcFeature') return;
        const declared = new Set(host.body.body.map(member => member.key?.name).filter(Boolean));
        const reads = [];
        function walk(node) {
          if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression' && !node.computed) {
            reads.push(node);
            if (node.parent.type === 'AssignmentExpression' && node.parent.left === node && node.parent.operator === '=') declared.add(node.property.name);
          }
          if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
              node.callee.object.name === 'Object' && node.callee.property.name === 'assign' && node.arguments[0]?.type === 'ThisExpression') {
            for (const argument of node.arguments.slice(1)) if (argument.type === 'ObjectExpression') {
              for (const property of argument.properties) if (property.type === 'Property' && !property.computed) declared.add(property.key.name ?? property.key.value);
            }
          }
          for (const key of source.visitorKeys[node.type] ?? []) {
            const child = node[key];
            if (Array.isArray(child)) child.forEach(item => { if (item?.type) walk(item); });
            else if (child?.type) walk(child);
          }
        }
        walk(host.body);
        for (const node of reads) if (!declared.has(node.property.name)) context.report({ node, messageId: 'missing', data: { name: node.property.name } });
      },
    };
  },
};
