import './pano-component'
import { MediaElementCreator } from '../image_utils/MediaElementCreator';
import { BoundingBoxTool } from '../image_utils/boundingBoxTool'

//<spherical-video-renderer/>
//document.body.insertAdjacentHTML('afterbegin',``);


//IMPORTANT TO GET CORRECT PANORAMA ASPECT RATIO:
//Lens FOVS:
//Arducam recommended lens: 20deg (16mm)
//S10e main camera: 77 deg

//specify number of divisions and then render that many threejs scenes to paint spectral images. We can paint mutliple images in one scene
export function initPanoTool(parentElement=document.body) {

    let BBTool; let PanoElm; let LensFOV = 30; let offscreen;
    let panos; let curElm; let curBB; let id;

    let container = document.createElement('div');
    container.id = 'panocontainer';
    
    container.insertAdjacentHTML('afterbegin',`
    Lens FOV: <input id="lensfov" value="${LensFOV}" min="1" max="179" type="number"/> Be sure this matches your camera lens for correct perspective<br/>
    Draw a box on the Picture-in-Picture to subdivide the image.
    <br/> 

    <button id="calibrate">Calibrate Sensors</button>
    
    Multiple? 
    <input type="checkbox" id="multiple" checked/>
    <input id="ninp" type="number" value="4"/> 
    
    <span style="display:none;"> 
        Workers? <input id="workers" type="checkbox" checked/> 
    </span>
    `); //temp ux

    parentElement.appendChild(container);

    let calibrate = container.querySelector('#calibrate');


    let fovsetter = container.querySelector("#lensfov");

    fovsetter.onchange = (ev) => {
        LensFOV = parseFloat(ev.target.value);
        resetPanos();
    }

    let multiplePanos = container.querySelector('#multiple');
    let nInput = container.querySelector('#ninp');
    let wrkrs = container.querySelector('#workers');
    
    let useWorkers = wrkrs?.checked || true; //todo: fix rendering bugs

    calibrate.onclick = () => {
        panos.forEach((pano) => {
            if(pano.useWorkers) 
                pano.renderThread.update({calibrate:true});
            else 
                pano.controls.calibrate();
        });
    }
    
    
    const clearPanos = () => {
        if(PanoElm) {
            PanoElm.remove();
            PanoElm = undefined;
        }
        if(panos) {
            panos.forEach(p => {p.remove();});
            panos.length = 0;
        }
        div2.innerHTML = '';
    }
    
    const resetPanos = () => {
        clearPanos();
        if(curElm) {
            if(curBB) setupPanos(curElm, curBB.rect.x, curBB.rect.y, curBB.rect.width, curBB.rect.height, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
            else setupPanos(curElm,0,0,curElm.videoWidth,curElm.videoHeight, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
        }
    }
    
    const resetPano = () => {
        if(curElm) {
            let offscreen = setupOffscreen(curElm,0,0,curElm.videoWidth,curElm.videoHeight);
            
            if(curBB) {
                let fov = LensFOV * curBB.rect.width/elm.videoWidth
                setupPano(offscreen, curBB.rect.width, curBB.rect.height, fov);
            }
            else {
                let fov = LensFOV;
                setupPano(offscreen, curElm.videoWidth,curElm.videoHeight, fov);
            }
        }
    }
    
    let reset = () => {
        if(multiplePanos.checked) {
            resetPanos();
        } else resetPano();
    }
    
    nInput.onchange = () => {
        resetPanos();
    }
    
    wrkrs.onchange = () => {
        if(wrkrs.checked) {
            useWorkers = true;
        } else useWorkers = false;
        reset();
    }
    
    multiplePanos.onchange = () => {
        reset();
    }
    
    
    let div = document.createElement('div'); 
    div.style.minHeight = "175px";
    let div2 = document.createElement('div');
    
    const setupOffscreen = (source,dx,dy,width,height) => {
        offscreen = new OffscreenCanvas(width,height);
        let context = offscreen.getContext('2d');
        let anim = (now) => {
            if(!PanoElm || !context) return;
            context.drawImage(source,dx,dy,width,height,0,0,offscreen.width,offscreen.height);
            
            PanoElm.renderTexture.needsUpdate = true;
            PanoElm.onVideoFrame(now);
            source.requestVideoFrameCallback(anim)
            
        }
        source.requestVideoFrameCallback(anim)
    
        return offscreen;
    }
    
    const setupPano = (source, resX, resY, fov) => {
        clearPanos();
        PanoElm = document.createElement('spherical-video-renderer');
        PanoElm.source = source;
        PanoElm.resX = resX;
        PanoElm.resY = resY;
        PanoElm.startFOV = 40;
        PanoElm.startVideoFOV = fov;
        div2.appendChild(PanoElm);
    }
    
    //we need to make lines for eahc part of the spectrogram we're imaging, we'll just split evenly n-times and create a single panorama control set
    const splitImageLines = (source,dx,dy,width,height,nSplits) => {
        // Array to store functions for each line
        let imageLines = [];
        // Calculate the width of each split
        const splitWidth = nSplits > 1 ? (width / nSplits) : width;
        let w_2 = splitWidth/2;
        for(let i = 0; i < nSplits; i++) {
            let x0 = Math.floor(splitWidth*i+w_2);
            let settings = {
                dx:dx + x0,
                dy,
                width:20,
                height,
                getImageBitmap:async ()=>{
                    //console.log(source,settings);
                    return await createImageBitmap(
                        source,
                        settings.dx,
                        settings.dy,
                        settings.width,
                        settings.height
                    );
                }
            };
            //console.log(settings)
    
            imageLines.push(settings);
    
        }
    
        return imageLines;
    
    }
    
    
    const setupPanos = (source,dx,dy,width,height,nSplits) => {
        if(typeof nSplits !== 'number' || isNaN(nSplits) || nSplits < 1) nSplits = 1;
        clearPanos();
        id = Math.random();
        let curId = id; //local for tracking videoframe callback
        /**
         * e.g.. 5 divisions evenly distributes 5 n-width pixel division lines within the source canvas
         * setup offscreens for each section within the bounding box to draw that line and convey the modified fov
         */
        const imageLines = splitImageLines(
            source,
            dx,dy,width,height,
            nSplits
        );
    
        let fov = LensFOV*imageLines[0].width/source.videoWidth;
    
        const masterPano = document.createElement('spherical-video-renderer');
        masterPano.source = new OffscreenCanvas(imageLines[0].width,imageLines[0].height);
        if(!useWorkers) masterPano.context = masterPano.source.getContext('2d');
        masterPano.resX = imageLines[0].width;
        masterPano.resY = imageLines[0].height;
        masterPano.useWorkers = useWorkers;
        masterPano.startFOV = 40;
        masterPano.startVideoFOV = fov;
        div2.appendChild(masterPano);
        let secondaryPanos = [];
    
        if(nSplits > 1) 
            for(let i = 1; i < nSplits; i++) {
                const PanoElm = document.createElement('spherical-video-renderer');
                PanoElm.hideControls = true;
                PanoElm.source = new OffscreenCanvas(imageLines[i].width,imageLines[i].height);
                if(!useWorkers) PanoElm.context = PanoElm.source.getContext('2d');
                PanoElm.resX = imageLines[i].width;
                PanoElm.resY = imageLines[i].height;
                PanoElm.useWorkers = useWorkers;
                PanoElm.startFOV = 40;
                PanoElm.startVideoFOV = fov;
                secondaryPanos.push(PanoElm);
                div2.appendChild(PanoElm);
            }
    
        panos = [masterPano,...secondaryPanos];
    
        let cdiv = document.createElement('div');
        // Set the container's style to use flexbox
        cdiv.style.display = 'flex';
        cdiv.style.flexWrap = 'wrap'; // Optional, to wrap canvases if they don't fit in one line
        cdiv.style.justifyContent = 'center'; // Optional, for horizontal alignment
        cdiv.style.alignItems = 'center'; // Optional, for vertical alignment
        div2.appendChild(cdiv);
    
        panos.forEach((p) => {
            const c = p.shadowRoot.querySelector('canvas');
            c.style.width = '100vw';
            c.style.height = '30vw';
            cdiv.appendChild(c);
        });
    
        masterPano.shadowRoot.getElementById('xSlider').oninput = (e) => {
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotation:{x:parseFloat(e.target.value)}});
                else pano.onXSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('ySlider').oninput = (e) => { 
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotation:{y:parseFloat(e.target.value)}});
                else pano.onYSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('zSlider').oninput = (e) => { 
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotation:{z:parseFloat(e.target.value)}});
                else pano.onZSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('xRate').oninput = (e) => {
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotationRate:{xRate:parseFloat(e.target.value)}});
                else pano.onXSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('yRate').oninput = (e) => { 
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotationRate:{yRate:parseFloat(e.target.value)}});
                else pano.onYSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('zRate').oninput = (e) => { 
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({rotationRate:{zRate:parseFloat(e.target.value)}});
                else pano.onZSliderChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('clear').onclick = () => { 
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({resetRender:true});
                else pano.resetRender();
            });
        }
        masterPano.shadowRoot.getElementById('fov').onchange = (e) => {
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({fov:parseFloat(e.target.value)});
                else pano.onFovInpChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('resetfov').onclick = () => {
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({resetFOV:true});
                else {
                    pano.resetFOV();
                }
            });
        }
        masterPano.shadowRoot.getElementById('vfov').onchange = (e) => {
            panos.forEach((pano) => {
                if(pano.useWorkers) pano.renderThread.update({videoFOV:parseFloat(e.target.value)});
                else pano.onVideoFovInpChange(e.target.value);
            });
        }
        masterPano.shadowRoot.getElementById('resetvfov').onclick = () => {
            panos.forEach((pano) => {
                if(pano.useWorkers) {
                    pano.renderThread.update({resetVideoFOV:true});
                    if(!pano.hideControls) {
                        pano.shadowRoot.getElementById('xSlider').value = 0;
                        pano.shadowRoot.getElementById('ySlider').value = 0;
                        pano.shadowRoot.getElementById('zSlider').value = 0;
                    }
                }
                else pano.resetVideoFOV();
            });
        }
    
        masterPano.shadowRoot.getElementById('startpos').onchange = (ev) => {
            panos.forEach((pano,i) => {
                if(pano.useWorkers) pano.renderThread.update({startPos:ev.target.value, resetRender:true}); //update worker
                else {
                    pano.startPos = ev.target.value;
                    pano.resetRender();
                }
            })
        }
    
        masterPano.shadowRoot.getElementById('autofov').onchange = (ev) => {
            panos.forEach((pano) => {
                if(useWorkers) {
                    pano.renderThread.update({autoAdjustFOV:ev.target.checked}); //need to transfer image to thread
                } else {
                    pano.autoAdjustFOV = ev.target.checked;
                }
            });
        }

        masterPano.shadowRoot.getElementById('save').onclick = () => {
            panos.forEach((pano,i) => {
                pano.canvas.toBlob((blob)=>{
                    let link = document.createElement('a');
                    link.download =  'scan'+i+'.png';
                    link.href = URL.createObjectURL(blob);
                    link.click();
                    URL.revokeObjectURL(link.href); // Clean up the URL object
                });
            });
        }
    
        let draw = (now) => {
            if(id !== curId || panos.length === 0 || imageLines.length < 1) return;
            panos.forEach((pano,i) => {
                imageLines[i].getImageBitmap().then((bmp) => {
                    if(useWorkers) pano.renderThread.update({image:bmp},[bmp]); //need to transfer image to thread
                    else {
                        pano.context.drawImage(bmp, 0, 0);
                        pano.renderTexture.needsUpdate = true;
                        pano.onVideoFrame(now);
                    }
                });
            });
    
            source.requestVideoFrameCallback(draw);
        }
    
        setTimeout(()=>{
            source.requestVideoFrameCallback(draw);
            setTimeout(()=>{
                if(useWorkers) {
                    masterPano.shadowRoot.getElementById('clear').click();
                    masterPano.shadowRoot.getElementById('resetvfov').click();
                }
            },100)
        },100); 
    
    }
    
    let newPano = true;
    const Media = new MediaElementCreator(div, {
        ontargetchanged:() => {
            newPano = true;
        },
        onstarted:(srcOrId, elm) => {
            if(elm && newPano) {
                newPano = false; curElm = elm;
                
                const container = document.getElementsByClassName('video-container')[0];
                container.style.position = 'fixed';
                container.style.right = '10px';
                elm.style.minWidth = "150px";
                elm.style.maxHeight = "150px";
                elm.style.opacity = "0.5";
                
                let onframe = () => {
                    if(offscreen && PanoElm) PanoElm.onVideoFrame(); //this will run internally if a video element, and not if a canvas (rn)
                    if('requestVideoFrameCallback' in elm) elm.requestVideoFrameCallback(onframe);
                }
                onframe();
    
                if(!multiplePanos.checked) {
                    let offscreen = setupOffscreen(elm,0,0,elm.videoWidth,elm.videoHeight);
                    let fov = LensFOV;
                    setupPano(offscreen, elm.videoWidth,elm.videoHeight, fov);
                }
                else setupPanos(elm,0,0,elm.videoWidth,elm.videoHeight, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
    
                BBTool?.clearBoundingBoxes(true);
                BBTool = new BoundingBoxTool(elm, { 
                    color: 'orange',
                    labelColor: 'orange',
                    maxBoxes:1,
                    oncreate: (box, boxes) => { 
                        console.log("Created", box, boxes); 
                        curBB = box;
                        if(!multiplePanos.checked) {
                            let offscreen = setupOffscreen(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height);
                            let fov = LensFOV * box.rect.width/elm.videoWidth
                            setupPano(offscreen, box.rect.width, box.rect.height, fov);
                        }
                        else setupPanos(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
                    },
                    onedited: (box, boxes, boxIndex) => { 
                        curBB = box;
                        if(!multiplePanos.checked) {
                            let offscreen = setupOffscreen(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height);
                            let fov = LensFOV * box.rect.width/elm.videoWidth;
                            setupPano(offscreen, box.rect.width, box.rect.height, fov);
                        }
                        else setupPanos(elm,box.rect.x,box.rect.y,box.rect.width,box.rect.height, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
                    },
                    ondelete: (box, boxes, boxIndex) => { 
                        console.log("Deleted", box, boxes);  
                        curBB = box;
                        if(!multiplePanos.checked) {
                            let offscreen = setupOffscreen(elm,0,0,elm.videoWidth,elm.videoHeight);
                            let fov = LensFOV;
                            setupPano(offscreen, elm.videoWidth,elm.videoHeight, fov);
                        }
                        else setupPanos(elm,0,0,elm.videoWidth,elm.videoHeight, nInput?.value ? (parseInt(nInput.value) || 1) : 1);
                    }
                });
            }
        }
    });
    
    container.appendChild(div);
    container.appendChild(div2);

    let out = {
        container,
        deinit:()=>{
            clearPanos();
            container.remove();
        }
    }
    
    return out;
}
