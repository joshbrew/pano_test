
import { workerCanvasRoutes, CanvasProps } from 'workercanvas';

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
//import { PickHelper } from './PickHelper'
//etc...
// import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
// import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
// import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
// import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
//minimal web worker for running offscreen canvases, 

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined') {

    const routes = {
        ...workerCanvasRoutes,
        receiveThreeCanvas:function(options:CanvasProps){ //modified canvas receiver that installs desired threejs modules
                const ThreeProps = { //e.g. install these systems to 'self', which is the worker canvas
                    THREE,
                    OrbitControls,
                    // EffectComposer,
                    // RenderPass,
                    // SMAAPass,
                    // UnrealBloomPass,
                    //PickHelper
                }

                Object.assign(options, ThreeProps); //install desired props to our canvas's 'self' reference

                let renderId = routes.setupCanvas(options); //the the base canvas tools do the rest, all ThreeJS tools are on self, for self contained ThreeJS renders
                //you can use the canvas render loop by default, or don't provide a draw function and just use the init and the Three animate() callback

                //let canvasopts = this.graph.CANVASES[renderId] as WorkerCanvas;

                return renderId;
            }
        //add more compatible routes that don't require graphscript
    };
    
    self.onmessage = (ev) => {
        if(ev.data.route) {
            if(Array.isArray(ev.data.args)) {
                routes[ev.data.route](...ev.data.args);
            } else routes[ev.data.route](ev.data.args);
        } //that's it! The functions handle worker communication internally
    
    }
    
}

export default self as any;
