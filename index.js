import './pano-component.js'
import { MediaElementCreator } from './MediaElementCreator.js';
import { BoundingBoxTool } from './BoundingBoxTool'

import "./index.css"

//<spherical-video-renderer/>
document.body.insertAdjacentHTML('afterbegin',``);


let BBTool; let PanoElm; let LensFOV = 20; let offscreen; let offscreenanim;

let div = document.createElement('div'); div.style.height = '40vw';
let div2 = document.createElement('div');

const setupOffscreen = (source,dx,dy,width,height) => {
    if(offscreen) {
        cancelAnimationFrame(offscreenanim);
    }
    offscreen = new OffscreenCanvas(width,height);
    let context = offscreen.getContext('2d');
    let anim = () => {
        context.drawImage(source,dx,dy,width,height,0,0,offscreen.width,offscreen.height);
        
        PanoElm.renderTexture.needsUpdate = true;
        offscreenanim = requestAnimationFrame(anim);
    }
    offscreenanim = requestAnimationFrame(anim);

    return offscreen;
}

const setupPano = (source, resX, resY, fov) => {
    if(PanoElm) PanoElm.remove();
    PanoElm = document.createElement('spherical-video-renderer');
    PanoElm.source = source;
    PanoElm.resX = resX;
    PanoElm.resY = resY;
    PanoElm.startFOV = 40;
    PanoElm.startVideoFOV = fov;
    div2.appendChild(PanoElm);
}

let newPano = true;
const Media = new MediaElementCreator(div, {
    ontargetchanged:() => {
        newPano = true;
    },
    onstarted:(srcOrId, elm) => {

        
        if(elm && newPano) {
            newPano = false;
            
            const container = document.getElementsByClassName('video-container')[0];
            container.style.position = 'fixed';
            container.style.right = '-180px';
            elm.style.width = "50%";
            elm.style.maxHeight = "300px";
            
            let onframe = () => {
                if(offscreen && PanoElm) PanoElm.onVideoFrame(); //this will run internally if a video element, and not if a canvas (rn)
                if('requestVideoFrameCallback' in elm) elm.requestVideoFrameCallback(onframe);
            }
            onframe();
            console.log(elm.videoWidth, elm.videoHeight)
            setupPano(elm, elm.videoWidth, elm.videoHeight, LensFOV);

            BBTool?.clearBoundingBoxes(true);
            BBTool = new BoundingBoxTool(elm, { 
                color: 'orange',
                labelColor: 'orange',
                maxBoxes:1,
                oncreate: (box, boxes) => { 
                    console.log("Created", box, boxes); 
                    setupOffscreen(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height);
                    let fov = LensFOV * box.rect.width/elm.videoWidth;
                    setupPano(offscreen, box.rect.width, box.rect.height, fov);
                },
                onedited: (box, boxes, boxIndex) => { 
                    let fov = LensFOV * box.rect.width/elm.videoWidth;
                    setupOffscreen(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height);
                    setupPano(offscreen, box.rect.width, box.rect.height, fov);
                },
                ondelete: (box, boxes, boxIndex) => { 
                    console.log("Deleted", box, boxes);  
                    setupPano(elm, elm.videoWidth, elm.videoHeight, LensFOV);
                    offscreen = undefined;
                    cancelAnimationFrame(offscreenanim);
                }
            });
        }
    }
});

document.body.appendChild(div);
document.body.appendChild(div2);

