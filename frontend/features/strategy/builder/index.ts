// Public API of the strategy builder sub-feature
export { BlockLibrary }        from './components/BlockLibrary';
export { StrategyCanvas }      from './components/StrategyCanvas';
export { CanvasBlock }         from './components/CanvasBlock';
export { ConnectionLayer }     from './components/ConnectionLayer';
export { BlockEditor }         from './components/BlockEditor';
export { BuilderToolbar }      from './components/BuilderToolbar';
export { StrategyJsonPanel }   from './components/StrategyJsonPanel';
export { useStrategyCanvas }   from './hooks/useStrategyCanvas';
export { BLOCK_LIBRARY, BLOCK_GROUPS, TYPE_COLOR, TYPE_BG,
         BLOCK_W, BLOCK_H, PORT_R, SNAP, CANVAS_W, CANVAS_H } from './constants/builder.constants';
export { uid, snap, portCenter, bezierPath,
         generateStrategyJSON, validateStrategy }               from './utils/builder.utils';
export type * from './types/builder.types';
