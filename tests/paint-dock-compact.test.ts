import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PaintDock from '../src/components/PaintDock';
import BrushTuning from '../src/components/BrushTuning';
const noop=()=>{};
const props: Parameters<typeof PaintDock>[0]={open:true,onToggle:noop,color:'#ff4d43',paintMode:true,eraseMode:false,brushHead:'soft',brushSize:3,opacity:.65,panelColor:'#222',accentColor:'#ff0',layers:[{name:'Layer 1',visible:true},{name:'Layer 2',visible:false}],selectedLayer:0,posterSize:2,onPosterSizeChange:noop,onStartPosterPlacement:noop,onColorChange:noop,onToolChange:noop,onBrushSizeChange:noop,onOpacityChange:noop,onLayerSelect:noop,onLayerToggle:noop,onLayerAdd:noop,onEyedropper:noop};

test('compact brush strip keeps all heads and a separate selected eraser, with tutorial target',()=>{
 const html=renderToStaticMarkup(createElement(PaintDock,props));
 assert.match(html,/class="paint-heads paint-brush-strip"/);
 assert.match(html,/data-tutorial="brush-heads"/);
 for(const label of ['Fine','Soft','Fat','Marker','Roller','Erase'])assert.ok(html.includes('>'+label+'</button>'));
 const erased=renderToStaticMarkup(createElement(PaintDock,{...props,eraseMode:true}));
 assert.match(erased,/aria-pressed="true"[^>]*>Erase<\/button>/);
 assert.equal((erased.match(/class="paint-head-selected"/g)??[]).length,1);
});

test('advanced layers and saved palettes are collapsed while all controls and workspace footer remain available',()=>{
 const html=renderToStaticMarkup(createElement(PaintDock,{...props,workspaceControls:createElement('button',null,'Canvas tools')}));
 assert.match(html,/<details class="paint-layers"[^>]*><summary>Layers/);
 assert.doesNotMatch(html,/<details[^>]* open/);
 for(const label of ['Select Layer 1','Hide Layer 1','Select Layer 2','Show Layer 2','Add drawing layer','Load saved palette','New palette name','Delete selected palette','Hex paint colour'])assert.ok(html.includes(`aria-label="${label}"`),label);
 assert.ok(html.includes('Canvas tools'));assert.ok(html.includes('TAGS'));assert.ok(html.includes('Create custom paint colour'));
});

test('compact basic brush tuning retains limits and advanced hue darkness paleness controls',()=>{
 const tuning={color:'#ff4d43',hue:10,darkness:4,paleness:6,brushSize:3,opacity:.65,onHueChange:noop,onSizeChange:noop,onOpacityChange:noop,onDarknessChange:noop,onPalenessChange:noop};
 const basic=renderToStaticMarkup(createElement(BrushTuning,tuning));
 assert.match(basic,/class="advanced-controls compact-brush-tuning"/);
 assert.match(basic,/min="0.3" max="30" step="0.3"[^>]*aria-label="Brush size"/);
 assert.match(basic,/min="5" max="100"[^>]*aria-label="Paint opacity"/);
 assert.doesNotMatch(basic,/aria-label="Paint darkness"/);
 const advanced=renderToStaticMarkup(createElement(BrushTuning,{...tuning,advanced:true}));
 for(const label of ['Paint colour','Paint darkness','Paint paleness'])assert.ok(advanced.includes(`aria-label="${label}"`));
});
