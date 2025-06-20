export class TreeNode<T> {
    value: T;
    children: TreeNode<T>[];

    constructor(value: T) {
        this.value = value;
        this.children = [];
    }

    addChild(child: TreeNode<T>): void {
        this.children.push(child);
    }
}

export class Tree<T> {
    root: TreeNode<T> | null;

    constructor(value?: T) {
        this.root = value !== undefined ? new TreeNode(value) : null;
    }

    setRoot(value: T): TreeNode<T> {
        this.root = new TreeNode(value);
        return this.root;
    }

    traverse(visit: (value: T) => void): void {
        function walk(node: TreeNode<T> | null): void {
            if (!node) return;
            visit(node.value);
            node.children.forEach((child) => walk(child));
        }
        walk(this.root);
    }
}
