import {
    noop,
    options,
    getNodes,
    innerHTML,
    clearArray,
    toLowerCase,
    deprecatedWarn,
    getChildContext,
    getContextByTypes
} from "./util";
import { diffProps } from "./diffProps";
import { disposeVnode } from "./dispose";
import { createDOMElement, removeDOMElement } from "./browser";
import { CurrentOwner, flattenChildren } from "./createElement";
import {
    processFormElement,
    postUpdateSelectedOptions
} from "./ControlledComponent";

//[Top API] React.isValidElement
export function isValidElement(vnode) {
    return vnode && vnode.vtype;
}
//[Top API] ReactDOM.render
export function render(vnode, container, callback) {
    return renderByAnu(vnode, container, callback);
}
//[Top API] ReactDOM.unstable_renderSubtreeIntoContainer
export function unstable_renderSubtreeIntoContainer(
    lastVnode,
    nextVnode,
    container,
    callback
) {
    deprecatedWarn("unstable_renderSubtreeIntoContainer");
    var parentContext = (lastVnode && lastVnode.context) || {};
    return renderByAnu(nextVnode, container, callback, parentContext);
}
//[Top API] ReactDOM.unmountComponentAtNode
export function unmountComponentAtNode(container, context = {}) {
    var lastVnode = container.__component;
    if (lastVnode) {
    // lastVnode._hostNode = container.firstChild;
        let nextVnode = {
            type: "#comment",
            text: "empty",
            vtype: 0
        };
        alignVnode(lastVnode, nextVnode, context, getVParent(container), []);
    }
}
//[Top API] ReactDOM.findDOMNode
export function findDOMNode(ref) {
    if (ref == null) {
        return null;
    }
    if (ref.nodeType === 1) {
        return ref;
    }
    return ref.__dom || null;
}
// 用于辅助XML元素的生成（svg, math),
// 它们需要根据父节点的tagName与namespaceURI,知道自己是存在什么文档中
function getVParent(container) {
    return {
        type: container.nodeName,
        namespaceURI: container.namespaceURI
    };
}

// ReactDOM.render的内部实现
function renderByAnu(vnode, container, callback, context = {}) {
    if (!isValidElement(vnode)) {
    throw `ReactDOM.render的第一个参数错误`; // eslint-disable-line
    }
    if (!(container && container.getElementsByTagName)) {
    throw `ReactDOM.render的第二个参数错误`; // eslint-disable-line
    }
    let mountQueue = [],
        rootNode,
        lastVnode = container.__component;
    if (lastVnode) {
    // lastVnode._hostNode = container.firstChild;??
        rootNode = alignVnode(
            lastVnode,
            vnode,
            getVParent(container),
            context,
            mountQueue
        );
    } else {
        mountQueue.executor = true;
        //如果是后端渲染生成，它的孩子中存在一个拥有data-reactroot属性的元素节点
        rootNode = genVnodes(container, vnode, context, mountQueue);
    }

    if (rootNode.setAttribute) {
        rootNode.setAttribute("data-reactroot", "");
    }

    var instance = vnode._instance;
    container.__component = vnode;
    clearRefsAndMounts(mountQueue);
    CurrentOwner.cur = null; //防止干扰
    var ret = instance || rootNode;
    if (callback) {
        callback.call(ret); //坑
    }
    //组件返回组件实例，而普通虚拟DOM 返回元素节点
    return ret;
}

function genVnodes(container, vnode, context, mountQueue) {
    let nodes = getNodes(container);
    let lastNode = null;
    for (var i = 0, el; (el = nodes[i++]); ) {
        if (el.getAttribute && el.getAttribute("data-reactroot") !== null) {
            lastNode = el;
        } else {
            container.removeChild(el);
        }
    }
    return container.appendChild(
        mountVnode(lastNode, vnode, getVParent(container), context, mountQueue)
    );
}

const patchStrategy = {
    0: mountText,
    1: mountElement,
    2: mountComponent,
    4: mountStateless,
    10: updateText,
    11: updateElement,
    12: updateComponent,
    14: updateComponent
};

function mountVnode(lastNode, vnode) {
    return patchStrategy[vnode.vtype].apply(null, arguments);
}

function updateVnode(lastVnode) {
    return patchStrategy[lastVnode.vtype + 10].apply(null, arguments);
}

function mountText(lastNode, vnode) {
    if (!lastNode || lastNode.nodeName !== vnode.type) {
        lastNode = createDOMElement(vnode);
    }
    vnode._hostNode = lastNode;
    return lastNode;
}

function updateText(lastVnode, nextVnode) {
    let dom = lastVnode._hostNode;
    nextVnode._hostNode = dom;
    if (lastVnode.text !== nextVnode.text) {
        dom.nodeValue = nextVnode.text;
    }
    return dom;
}

function genMountElement(lastNode, vnode, vparent, type) {
    if (lastNode && toLowerCase(lastNode.nodeName) === type) {
        return lastNode;
    } else {
        let dom = createDOMElement(vnode, vparent);
        if (lastNode) {
            while (lastNode.firstChild) {
                dom.appendChild(lastNode.firstChild);
            }
        }
        return dom;
    }
}

const formElements = {
    select: 1,
    textarea: 1,
    input: 1
};

function mountElement(lastNode, vnode, vparent, context, mountQueue) {
    let { type, props, ref } = vnode;
    let dom = genMountElement(lastNode, vnode, vparent, type);

    vnode._hostNode = dom;

    let method = lastNode ? alignChildren : mountChildren;
    method(dom, vnode, context, mountQueue);

    if (vnode.checkProps) {
        diffProps(props, {}, vnode, {}, dom);
    }
    if (ref) {
        pendingRefs.push(ref.bind(true, dom));
    }
    if (formElements[type]) {
        processFormElement(vnode, dom, props);
    }

    return dom;
}

//将虚拟DOM转换为真实DOM并插入父元素
function mountChildren(parentNode, vparent, context, mountQueue) {
    var children = flattenChildren(vparent);
    for (let i = 0, n = children.length; i < n; i++) {
        parentNode.appendChild(
            mountVnode(null, children[i], vparent, context, mountQueue)
        );
    }
}

function alignChildren(parentNode, vparent, context, mountQueue) {
    let children = flattenChildren(vparent),
        childNodes = parentNode.childNodes,
        insertPoint = childNodes[0] || null,
        j = 0,
        n = children.length;
    for (let i = 0; i < n; i++) {
        let vnode = children[i];
        let lastNode = childNodes[j];
        let dom = mountVnode(lastNode, vnode, vparent, context, mountQueue);
        if (dom === lastNode) {
            j++;
        }
        parentNode.insertBefore(dom, insertPoint);
        insertPoint = dom.nextSibling;
    }
    while (childNodes[n]) {
        parentNode.removeChild(childNodes[n]);
    }
}

function mountComponent(lastNode, vnode, vparent, parentContext, mountQueue) {
    let { type, props } = vnode;
    let lastOwn = CurrentOwner.cur;
    let componentContext = getContextByTypes(parentContext, type.contextTypes);
    let instance = new type(props, componentContext); //互相持有引用
    CurrentOwner.cur = lastOwn;
    vnode._instance = instance;
    //防止用户没有调用super或没有传够参数
    instance.props = instance.props || props;
    instance.context = instance.context || componentContext;
    //用于refreshComponent
    instance.nextVnode = vnode;

    vnode.context = componentContext;
    vnode.parentContext = parentContext;
    vnode.vparent = vparent;

    let state = instance.state;

    if (instance.componentWillMount) {
        instance.componentWillMount();
        state = instance.__mergeStates(props, componentContext);
    }

    let rendered = renderComponent.call(instance, vnode, props, componentContext, state);
    instance.__hydrating = true;

    var childContext = rendered.vtype
        ? getChildContext(instance, parentContext)
        : parentContext;

    let dom = mountVnode(lastNode, rendered, vparent, childContext, mountQueue);

    createInstanceChain(instance, vnode, rendered);
    updateInstanceChain(instance, dom);

    mountQueue.push(instance);

    return dom;
}
function mountStateless(lastNode, vnode, vparent, parentContext, mountQueue) {
   
    let componentContext = getContextByTypes(parentContext, vnode.type.contextTypes);
    let instance = new Stateless(vnode.type);
    let rendered = renderComponent.call(instance, vnode, vnode.props, componentContext);

    let dom = mountVnode(lastNode, rendered, vparent, parentContext, mountQueue);

    //用于refreshComponent
    instance.nextVnode = vnode;
    vnode.context = parentContext;
    vnode.vparent = vparent;

    createInstanceChain(instance, vnode, rendered);
    updateInstanceChain(instance, dom);
    mountQueue.push(instance);

    return dom;
}

function renderComponent(vnode, props, context, state) {
    // 同时给有状态与无状态组件使用
    this.props = props;
    this.state = state || null;
    this.context = context;

    //调整全局的 CurrentOwner.cur
    var lastOwn = CurrentOwner.cur;
    CurrentOwner.cur = this;

    let rendered = this.render();
    //比较罕见的用法，返回一个带render的普通对象
    if(rendered && rendered.render){
        rendered = rendered.render();
    }

    CurrentOwner.cur = lastOwn;
    //组件只能返回组件或null

    if (rendered === null || rendered === false) {
        rendered = { type: "#comment", text: "empty", vtype: 0 };
    } else if (!rendered || !rendered.vtype) {//true, undefined, array, {}
        throw new Error(
            `@${vnode.type.name}#render:You may have returned undefined, an array or some other invalid object`
        );
    }

    vnode._instance = this;
    this.__rendered = rendered;
    return rendered;
}

function Stateless(render) {
    this.refs = {};
    this.render = function() {
        return render(this.props, this.context);
    };
    this.__pendingCallbacks = [];
    this.__current = noop;
}

//Stateless.prototype.render = renderComponent;

function updateComponent(lastVnode, nextVnode, vparent, context, mountQueue) {
    var instance = lastVnode._instance;
    var ref = lastVnode.ref;
    if (ref && lastVnode.vtype === 2) {
        lastVnode.ref(null);
    }
    let nextContext = getContextByTypes(context, nextVnode.type.contextTypes);
    let nextProps = nextVnode.props;

    if (instance.componentWillReceiveProps) {
        instance.__receiving = true;
        instance.componentWillReceiveProps(nextProps, nextContext);
        instance.__receiving = false;
    }
    if (!mountQueue.executor) {
        mountQueue.executor = true;
    }
    // shouldComponentUpdate为false时不能阻止setState/forceUpdate cb的触发

    //用于refreshComponent
    instance.nextVnode = nextVnode;
    nextVnode.context = nextContext;
    nextVnode.parentContext = context;
    nextVnode.vparent = vparent;

    var queue = [];
    _refreshComponent(instance, queue);
    mountQueue.push(instance);
    clearRefsAndMounts(queue);
    return instance.__dom;
}




function _refreshComponent(instance, mountQueue) {
    let {
        props: lastProps,
        state: lastState,
        context: lastContext,
        __rendered: lastRendered,
        //  __current: lastVnode,
        __dom: dom
    } = instance;
    instance.__renderInNextCycle = null;

    let nextVnode = instance.nextVnode;
    let nextContext = nextVnode.context;
    //

    let parentContext = nextVnode.parentContext;
    let nextProps = nextVnode.props;
    let vparent = nextVnode.vparent;

    nextVnode._instance = instance; //important

    let nextState = instance.__mergeStates
        ? instance.__mergeStates(nextProps, nextContext)
        : null;

    if (
        !instance.__forceUpdate &&
    instance.shouldComponentUpdate &&
    instance.shouldComponentUpdate(nextProps, nextState, nextContext) === false
    ) {
        instance.__forceUpdate = false;
        return dom;
    }

    instance.__hydrating = true;
    instance.__forceUpdate = false;
    if (instance.componentWillUpdate) {
        instance.componentWillUpdate(nextProps, nextState, nextContext);
    }
    instance.lastProps = lastProps;
    instance.lastState = lastState;
    instance.lastContext = lastContext;
    //这里会更新instance的props, context, state
    let nextRendered = renderComponent.call(
        instance,
        nextVnode,
        nextProps,
        nextContext,
        nextState
    );

    if(lastRendered!== nextRendered && parentContext){
        dom = alignVnode(
            lastRendered,
            nextRendered,
            vparent,
            getChildContext(instance, parentContext),
            mountQueue
        );
    }
    createInstanceChain(instance, nextVnode, nextRendered);
    updateInstanceChain(instance, dom);
    clearRefs();
    instance.__hydrating = false;
    instance.__lifeStage = 2;

    return dom;
}

export function alignVnode(lastVnode, nextVnode, vparent, context, mountQueue) {
    let node = lastVnode._hostNode,
        dom;
    if (isSameNode(lastVnode, nextVnode)) {
        dom = updateVnode(lastVnode, nextVnode, vparent, context, mountQueue);
    } else {
        disposeVnode(lastVnode);
        let innerMountQueue = mountQueue.executor
            ? mountQueue
            : nextVnode.vtype === 2 ? [] : mountQueue;
        dom = mountVnode(null, nextVnode, vparent, context, innerMountQueue);
        let p = node.parentNode;
        if (p) {
            p.replaceChild(dom, node);
            removeDOMElement(node);
        }
        if (innerMountQueue !== mountQueue) {
            clearRefsAndMounts(innerMountQueue);
        }
    }
    return dom;
}

function updateElement(lastVnode, nextVnode, vparent, context, mountQueue) {
    let dom = lastVnode._hostNode;
    let lastProps = lastVnode.props;
    let nextProps = nextVnode.props;
    let ref = nextVnode.ref;
    nextVnode._hostNode = dom;
    if (nextProps[innerHTML]) {
        var list = lastVnode.vchildren || [];
        list.forEach(function(el) {
            disposeVnode(el);
        });
        list.length = 0;
    } else {
        if (lastProps[innerHTML]) {
            while (dom.firstChild) {
                dom.removeChild(dom.firstChild);
            }
            mountChildren(dom, nextVnode, context, mountQueue);
        } else {
            diffChildren(lastVnode, nextVnode, dom, context, mountQueue);
        }
    }

    if (lastVnode.checkProps || nextVnode.checkProps) {
        diffProps(nextProps, lastProps, nextVnode, lastVnode, dom);
    }
    if (nextVnode.type === "select") {
        postUpdateSelectedOptions(nextVnode);
    }
    if (ref) {
        pendingRefs.push(ref.bind(0, dom));
    }
    return dom;
}

function diffChildren(lastVnode, nextVnode, parentNode, context, mountQueue) {
    let lastChildren = lastVnode.vchildren,
        nextChildren = flattenChildren(nextVnode),
        nextLength = nextChildren.length,
        lastLength = lastChildren.length;
    //如果旧数组长度为零
    if (nextLength && !lastLength) {
        nextChildren.forEach(function(vnode) {
            let curNode = mountVnode(null, vnode, lastVnode, context, mountQueue);
            parentNode.appendChild(curNode);
        });
        return;
    }
    let maxLength = Math.max(nextLength, lastLength),
        insertPoint = parentNode.firstChild,
        removeHits = {},
        fuzzyHits = {},
        actions = [],
        i = 0,
        hit,
        dom,
        oldDom,
        hasExecutor = mountQueue.executor,
        nextChild,
        lastChild;
    //第一次循环，构建移动指令（actions）与移除名单(removeHits)与命中名单（fuzzyHits）
    if (nextLength) {
        actions.length = nextLength;
        while (i < maxLength) {
            nextChild = nextChildren[i];
            lastChild = lastChildren[i];
         
            if (nextChild && lastChild && isSameNode(lastChild, nextChild)) {
                //  如果能直接找到，命名90％的情况
                actions[i] = {
                    last: lastChild,
                    next: nextChild,
                    directive: "update"
                };
                removeHits[i] = true;
            } else {
                if (nextChild) {
                    hit = nextChild.type + (nextChild.key || "");
                    if (fuzzyHits[hit] && fuzzyHits[hit].length) {
                        var oldChild = fuzzyHits[hit].shift();
                        // 如果命中旧的节点，将旧的节点移动新节点的位置，向后移动
                        actions[i] = {
                            last: oldChild,
                            next: nextChild,
                            directive: "moveAfter"
                        };
                        removeHits[oldChild._i] = true;
                    }
                }
                if (lastChild) {
                    //如果没有命中或多了出来，那么放到命中名单中，留给第二轮循环使用
                    lastChild._i = i;
                    hit = lastChild.type + (lastChild.key || "");
                    let hits = fuzzyHits[hit];
                    if (hits) {
                        hits.push(lastChild);
                    } else {
                        fuzzyHits[hit] = [lastChild];
                    }
                }
            }
            i++;
        }
    }
    for (let j = 0, n = actions.length; j < n; j++) {
        let action = actions[j];
        if (!action) {
            let curChild = nextChildren[j];
            hit = curChild.type + (curChild.key || "");
            if (fuzzyHits[hit] && fuzzyHits[hit].length) {
                oldChild = fuzzyHits[hit].shift();
                oldDom = oldChild._hostNode;
                parentNode.insertBefore(oldDom, insertPoint);
                dom = updateVnode(oldChild, curChild, lastVnode, context, mountQueue);
                removeHits[oldChild._i] = true;
            } else {
                //为了兼容 react stack reconciliation的执行顺序，添加下面三行，
                //在插入节点前，将原位置上节点对应的组件先移除
                var removed = lastChildren[j];
                if (removed && !removed._disposed && !removeHits[j]) {
                    disposeVnode(removed);
                }
                //如果找不到对应的旧节点，创建一个新节点放在这里
                dom = mountVnode(null, curChild, lastVnode, context, mountQueue);
                parentNode.insertBefore(dom, insertPoint);
            }
        } else {
            oldDom = action.last._hostNode;
            if (action.action === "moveAfter") {
                parentNode.insertBefore(oldDom, insertPoint);
            }
            dom = updateVnode(
                action.last,
                action.next,
                lastVnode,
                context,
                mountQueue
            );
        }
        insertPoint = dom.nextSibling;
    }
    //移除
    lastChildren.forEach(function(el, i) {
        if (!removeHits[i]) {
            var node = el._hostNode;
            if (node) {
                removeDOMElement(node);
            }
            disposeVnode(el);
        }
    });
    if (!hasExecutor && mountQueue.executor) {
        clearRefsAndMounts(mountQueue);
    }
}

function isSameNode(a, b) {
    if (a.type === b.type && a.key === b.key) {
        return true;
    }
}
//=================================
//******* 构建实例链 *******
function createInstanceChain(instance, vnode, rendered) {
    instance.__current = vnode;
    if (rendered._instance) {
        rendered._instance.__parentInstance = instance;
    }
}

function updateInstanceChain(instance, dom) {
    instance.__dom = instance.__current._hostNode = dom;
    var parent = instance.__parentInstance;
    if (parent) {
        updateInstanceChain(parent, dom);
    }
}

//******* 调度系统 *******
export const pendingRefs = [];
function clearRefs() {
    var refs = pendingRefs.slice(0);
    pendingRefs.length = 0;
    refs.forEach(function(fn) {
        fn();
    });
}
function callUpdate(instance) {
    if (instance.__lifeStage === 2) {
        if (instance.componentDidUpdate) {
            instance.__didUpdate = true;
            instance.componentDidUpdate(
                instance.lastProps,
                instance.lastState,
                instance.lastContext
            );
            if (!instance.__renderInNextCycle) {
                instance.__didUpdate = false;
            }
        }
        options.afterUpdate(instance);
        instance.__lifeStage = 1;
    }
}

function clearRefsAndMounts(queue) {
    options.beforePatch();

    clearRefs();
    queue.forEach(function(instance) {
        if (!instance.__lifeStage) {
            if (instance.componentDidMount) {
                instance.componentDidMount();
                instance.componentDidMount = null;
            }
            instance.__lifeStage = 1;

            options.afterMount(instance);
        } else {
            callUpdate(instance);
        }

        var ref = instance.__current.ref;
        if (ref) {
            ref(instance.__mergeStates ? instance : null);
        }
        instance.__hydrating = false;
        while (instance.__renderInNextCycle) {
            _refreshComponent(instance, []);
            callUpdate(instance);
        }
        clearArray(instance.__pendingCallbacks).forEach(function(fn) {
            fn.call(instance);
        });
    });
    queue.length = 0;
    options.afterPatch();
}

var dirtyComponents = [];
function mountSorter(c1, c2) {
    return c1.__mountOrder - c2.__mountOrder;
}
options.flushBatchedUpdates = function(queue) {
    if (!queue) {
        dirtyComponents.sort(mountSorter);
        queue = dirtyComponents;
    }
    clearRefsAndMounts(queue);
};

options.enqueueUpdate = function(instance) {
    if (dirtyComponents.indexOf(instance) == -1) {
        dirtyComponents.push(instance);
    }
};
