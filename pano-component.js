import * as THREE from 'three';
import {DeviceOrientationControls} from './DeviceOrientationControls';
//import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from 'workercanvas'
import worker from './three.worker'
// import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
// import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';


export class SphericalVideoRenderer extends HTMLElement {
    // Class properties
    sampleFreq = 60;
    useWorkers = false;
    useOrientation = true;
    useGyro = false;
    usePiSocket = false;
    useMotion = false; //can also use movement
    maxFOV = 120; // fisheye effect limit
    startFOV = 40;
    startVideoFOV = 20;
    resX;
    resY;
    lastUpdateTime;
    renderThread;
    source; context;
    hideControls=false;

    rotationRate = {
        initialX: 0,
        initialY: 0,
        initialZ: 0,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        ticks: 0
    };
    played = false;
    animating = false; animationFrameId;
    startPos = 'center'; autoAdjustFOV = false;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    initRenderThread = () => {

        //this should automatically transmit orientation information so we should be set
        this.renderThread = Renderer({
            worker,
            canvas:this.canvas,
            route:'receiveThreeCanvas',
            startFOV:this.startFOV,
            startVideoFOV:this.startVideoFOV,
            resX:this.resX,
            resY:this.resY,
            maxFOV:this.maxFOV,
            autoAdjustFOV:this.autoAdjustFOV,
            init:function(self,canvas,context){ 

                const { THREE } = self;
                //could also use 'this' but self is a cleaner association with the render thread
                self.rotationRate = {
                    xRate:0, rotX:0, initialX:0,
                    yRate:0, rotY:0, initialY:0,
                    zRate:0, rotZ:0, initialZ:0,
                    ticks:0
                };

                self.createPartialSphere = (fov) => {
                    self.sphereFOV = fov;
                    let resX = self.resX || self.source.videoWidth || 16;
                    let resY = self.resY || self.source.videoHeight || 9;
                    let horizontalFOVDegrees = fov;
                    let verticalFOVDegrees = (horizontalFOVDegrees / resX) * resY;
                    let horizontalFOVRadians = THREE.MathUtils.degToRad(horizontalFOVDegrees);
                    let verticalFOVRadians = THREE.MathUtils.degToRad(verticalFOVDegrees);
                    let radius = 5;
                    let widthSegments = 50;
                    let heightSegments = 50;
                    
                    let partialSphereGeometry = new THREE.SphereGeometry(
                        radius, widthSegments, heightSegments,
                        Math.PI / 2 - horizontalFOVRadians / 2, horizontalFOVRadians,
                        Math.PI / 2 - verticalFOVRadians / 2, verticalFOVRadians
                    );
            
                    if (self.partialSphere) {
                        self.scene.remove(self.partialSphere);
                        self.controls?.dispose();
                    }
            
                    self.partialSphere = new THREE.Mesh(partialSphereGeometry, self.renderMaterial);
                    //self.partialSphere.rotation.z = Math.PI;
                    self.partialSphere.material.side = THREE.DoubleSide;
                    self.scene.add(self.partialSphere);
            
                    if (self.useOrientation) { //probably safest option for mobile
                        self.controls = new DeviceOrientationControls(self.partialSphere, undefined, () => {
                            self.lookAtSphere();
                        }, self.canvas);
                        self.controls.update();
                       
                    } 
            
                }

                self.resetRender = () => {
                    if(self.partialSphere) {
                        self.lookAtSphere();
                        let startPos = self.startPos;
                        if(startPos && startPos !== 'center') {
                            let fov = self.camera.fov;
                            let vfov = self.sphereFOV;
                            let diff = vfov - 0.75*fov;
                            if(startPos.value === 'left') {
                                self.camera.rotateY(diff*Math.PI/180);
                            } else {
                                self.camera.rotateY(-diff*Math.PI/180);
                            }
                        }
                    }
                    self.renderer.clear(); 
                }
            

                self.lookAtSphere = () => {
                    // Assuming the point we are tracking on the sphere's surface is initially at (0, 0, 1) before rotation
                    let initialDirection = new THREE.Vector3(0, 0, 1);
                    let sphereCenter = self.partialSphere.position; // Center of the sphere
                    let direction = initialDirection.clone().applyQuaternion(self.partialSphere.quaternion).normalize();
            
                    // Now set the camera position to the center of the sphere
                    self.camera.position.copy(sphereCenter);
            
                    // Calculate a point in space in the direction we want the camera to look
                    let lookAtPoint = new THREE.Vector3().addVectors(sphereCenter, direction);
            
                    // Make the camera look in the direction of the sphere's rotation
                    self.camera.lookAt(lookAtPoint);
                    self.camera.rotation.z = 0;
                    if(/(android)/i.test(navigator.userAgent)) {
                        self.camera.rotation.z -= Math.PI/2;
                    }
                }

                self.destroy = () => {
                    // Stop the animation loop
                    cancelAnimationFrame(self.animationFrameId);
            
                    // Dispose of materials, geometries, and textures
                    self.scene.traverse(object => {
                        if (object.isMesh) {
                            object.geometry.dispose();
            
                            if (object.material?.isMaterial) {
                                self.disposeMaterial(object.material);
                            } else {
                                // an array of materials
                                for (const material of object.material) self.disposeMaterial(material);
                            }
                        }
                    });
            
                    // Dispose of the render target
                    self.renderTarget.dispose();
            
                    // Dispose of video texture
                    if (self.renderTexture) {
                        self.renderTexture.dispose();
                    }
            
                    // Remove event listeners
                    window.removeEventListener('resize', self.onWindowResize);
            
                    // Destroy the renderer
                    self.renderer.dispose();
            
                    // Remove the canvas
                    //self.shadowRoot.removeChild(self.renderer.domElement);
                }

                self.createVideoTexture = () => {

                    self.renderTexture = new THREE.CanvasTexture(self.source);
            
                    self.renderTexture.colorSpace = THREE.SRGBColorSpace; //
                    self.renderMaterial = new THREE.MeshBasicMaterial({ map: self.renderTexture });
                    self.renderTexture.repeat.set(-1, -1); // self will flip the texture horizontally to match source perspective
                    self.renderTexture.offset.set(1, 1); // Offset needs to be adjusted when flipping
                }
            
                self.updateRotation = (axis, value) => {
            
                    if (self.partialSphere) {
                        self.partialSphere.rotation[axis] = value;
                        if(self.autoAdjustFOV) self.updateCameraFOV();
                    }
            
                }
            
                self.updateFOV = (value) => {
            
                    let val = value;
                    const newFOV = Math.min(self.maxFOV, val);
                    self.camera.fov = newFOV;
                    
                    self.rotationRate.xRate = 0;
                    self.rotationRate.yRate = 0;
                    self.rotationRate.zRate = 0;

                    self.camera.updateProjectionMatrix();
                    self.renderer.clear();
            
                }
            
                self.resetFOV = () => {
            
                    self.rotationRate.xRate = 0;
                    self.rotationRate.yRate = 0;
                    self.rotationRate.zRate = 0;
                    self.camera.fov = self.startFOV;
                    self.camera.position.z = 0;
                    self.camera.updateProjectionMatrix();
                    self.renderer.clear();
                }
            
                self.updateVideoFOV = (value) => {
            
                    self.createPartialSphere(parseFloat(value));
                    self.renderer.clear();
            
                }
            
                self.resetVideoFOV = () => {
            
                    self.rotationRate.xRate = 0;
                    self.rotationRate.yRate = 0;
                    self.rotationRate.zRate = 0;
                    self.resetFOV();
                    self.createPartialSphere(self.startVideoFOV);
                    self.resetRender();
            
                }
            
                self.onWindowResize = () => {
            
                    self.camera.aspect = Math.max(canvas.width,canvas.height)/Math.min(canvas.width,canvas.height);
                    self.camera.updateProjectionMatrix();
                    self.renderer.setSize(canvas.width, canvas.height);
                    self.renderer.clear();
            
                }

                canvas.addEventListener('resize',self.onWindowResize);
            
                // self.updatePartialSphereRotation = () => {
            
                //     // Assuming rotationRate values are updated elsewhere (e.g., via gyro or orientation events)
                //     if (self.rotationRate.ticks > 0) {
                //         self.partialSphere.rotation.x = self.rotationRate.rotX - self.rotationRate.initialX;
                //         self.partialSphere.rotation.y = self.rotationRate.rotY - self.rotationRate.initialY;
                //         self.partialSphere.rotation.z = self.rotationRate.rotZ - self.rotationRate.initialZ;
                //         self.rotationRate.ticks = 0;
                //     }
            
                // }
            
                self.renderPartialSphereToTexture = () => {
            
                    // Render the partial sphere to the render target
                    self.renderer.setRenderTarget(self.renderTarget);
                    self.renderer.render(self.scene, self.camera);
                    self.renderer.setRenderTarget(null);
            
                }
            
                self.updateCameraFOV = () => {
            
                     // Calculate the new FOV based on rotation, for example:
                    let val = 2*180 * (Math.abs(self.partialSphere.rotation.x) + Math.abs(self.partialSphere.rotation.y))/Math.PI;
                   
                    const newFOV = Math.min(
                        self.maxFOV, val);
                  
                    if(newFOV > self.camera.fov) {
                        // Update camera properties
                        self.camera.fov = newFOV;
                        self.camera.updateProjectionMatrix(); // self is necessary to apply the new FOV;
                        self.renderer.clear();
                        //self.shadowRoot.getElementById('fov').value = newFOV;
                    } else if(val > self.maxFOV) {
                        //console.log(val);
                    }
            
                }

                self.onVideoFrame = () => {

                    // Get the current time
                    const currentTime = performance.now();
                    // Calculate the elapsed time since the last frame in seconds
                    const elapsedTime = (currentTime - self.lastUpdateTime) / 1000;
                    // Update the last update time
                    self.lastUpdateTime = currentTime;

                    // Update the sphere's rotation based on the rate and elapsed time
                    self.partialSphere.rotation.x += self.rotationRate.xRate * elapsedTime;
                    self.partialSphere.rotation.y += self.rotationRate.yRate * elapsedTime;
                    self.partialSphere.rotation.z += self.rotationRate.zRate * elapsedTime;

                    self.controls?.update(); //we need to update here so we aren't repainting frames in different positions
                    if(self.partialSphere && self.autoAdjustFOV) self.updateCameraFOV();
                    self.renderPartialSphereToTexture();
                }

                self.rotationRate = {
                    initialX: 0,
                    initialY: 0,
                    initialZ: 0,
                    x: 0,
                    y: 0,
                    z: 0,
                    rotX: 0,
                    rotY: 0,
                    rotZ: 0,
                    ticks: 0
                };

                self.scene = new THREE.Scene();
                self.camera = new THREE.PerspectiveCamera( 
                    self.startFOV, 
                    Math.max(canvas.width,canvas.height)/Math.min(canvas.width,canvas.height), 
                    0.1, 
                    1000
                );
                self.startPos = 'center';
        
                //self.camera.position.z = -10;
                self.camera.rotation.y = Math.PI;
                self.camera.rotation.z = Math.PI;

                self.source = new OffscreenCanvas(self.resX, self.resY);
                self.sourceCtx = self.source.getContext('2d');

                self.renderer = new THREE.WebGLRenderer({ alpha:true, canvas, preserveDrawingBuffer: true, antialias:true });
                self.renderer.autoClear = false;
                self.renderer.setClearColor(new THREE.Color("rgb(0,0,0)"),0);
                self.renderer.setSize(canvas.width, canvas.height);
        
                //self.controls = new OrbitControls( self.camera, canvas );
                //self.controls.update();
                
                self.renderTarget = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
                self.createVideoTexture();

                self.createPartialSphere(self.startFOV);

            },
            draw:function(self,canvas,context) {
                self.renderer.clearDepth();
                self.renderer.render(self.scene,self.camera);
            },
            update:(self,canvas,context,input) => {
                if(typeof input === 'object') {
                    if(input.image && self.renderTexture) {
                        self.sourceCtx.drawImage(input.image,0,0);
                        self.renderTexture.needsUpdate = true;
                        self.onVideoFrame();
                    }
                    if(input.rotation) 
                        Object.keys(input.rotation).forEach((k)=> self.updateRotation(k,input.rotation[k]));
                    if(input.rotationRate) Object.assign(self.rotationRate,input.rotationRate);
                    if(input.startPos) self.startPos = input.startPos;
                    if(input.resetVideoFOV) self.resetVideoFOV();
                    if(input.resetFOV) {
                        self.resetFOV();
                    }
                    if(input.videoFOV) self.updateVideoFOV(input.videoFOV);
                    if(input.fov) self.updateFOV(input.fov);
                    if(input.resetRender) self.resetRender(); //do this last
                    if(input.autoAdjustFOV) self.autoAdjustFOV = input.autoAdjustFOV;
                }
                
                
            },
            clear:function(self){
                self.destroy();
            }
        });

        //set source as the source canvas,
        //update xRate, yRate, and zRate 
    }

    setupScene() {

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 
            this.startFOV, 
            Math.max(this.canvas.width,this.canvas.height)/Math.min(this.canvas.width,this.canvas.height), 
            0.1, 
            1000
        );

        //this.camera.position.z = -10;
        this.camera.rotation.y = Math.PI;
        this.camera.rotation.z = Math.PI;

        this.renderer = new THREE.WebGLRenderer({ alpha:true, canvas: this.canvas, preserveDrawingBuffer: true, antialias:true });
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new THREE.Color("rgb(0,0,0)"),0);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        //this.controls = new OrbitControls( this.camera, this.renderer.domElement );
        //this.controls.update();
        
        this.renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
        
        // const renderPass = new RenderPass(this.scene, this.camera); 
        // renderPass.clear = false;
        // this.renderPass = renderPass;
        // // Set up postprocessing chain
        // this.composer = new EffectComposer(this.renderer);
        // this.composer.addPass(this.renderPass);

        // // Create a hue-saturation shader pass
        // const colorGradingPass = new ShaderPass(HueSaturationShader);
        // colorGradingPass.uniforms['saturation'].value = 0.25;  // increase saturation
        // colorGradingPass.uniforms['hue'].value = 0;           // adjust hue, if necessary
        // this.composer.addPass(colorGradingPass);

    }

    destroy() {

        if(this.renderThread) {
            this.renderThread.terminate();
        } else {
            // Stop the animation loop
            cancelAnimationFrame(this.animationFrameId);

            // Dispose of materials, geometries, and textures
            this.scene.traverse(object => {
                if (object.isMesh) {
                    object.geometry.dispose();

                    if (object.material?.isMaterial) {
                        this.disposeMaterial(object.material);
                    } else {
                        // an array of materials
                        for (const material of object.material) this.disposeMaterial(material);
                    }
                }
            });

            // Dispose of the render target
            this.renderTarget.dispose();

            // Dispose of video texture
            if (this.renderTexture) {
                this.renderTexture.dispose();
            }

            // Remove event listeners
            window.removeEventListener('resize', this.onWindowResize);

            // Destroy the renderer
            this.renderer.dispose();

            // Remove the canvas
            //this.shadowRoot.removeChild(this.renderer.domElement);
        }
        
    }

    disposeMaterial(material) {
        material.dispose();
    }


    createPartialSphere(fov) {
        this.sphereFOV = fov;
        let resX = this.resX || this.source.videoWidth || 16;
        let resY = this.resY || this.source.videoHeight || 9;
        let horizontalFOVDegrees = fov; 
        let verticalFOVDegrees = (horizontalFOVDegrees / resX) * resY;
        let horizontalFOVRadians = THREE.MathUtils.degToRad(horizontalFOVDegrees);
        let verticalFOVRadians = THREE.MathUtils.degToRad(verticalFOVDegrees);
        let radius = 5;
        let widthSegments = 50;
        let heightSegments = 50;
        
        let partialSphereGeometry = new THREE.SphereGeometry(
            radius, widthSegments, heightSegments,
            Math.PI / 2 - horizontalFOVRadians / 2, horizontalFOVRadians,
            Math.PI / 2 - verticalFOVRadians / 2, verticalFOVRadians
        );

        if (this.partialSphere) {
            this.scene.remove(this.partialSphere);
            this.controls?.dispose();
        }

        this.partialSphere = new THREE.Mesh(partialSphereGeometry, this.renderMaterial);
        //this.partialSphere.rotation.z = Math.PI;
        this.partialSphere.material.side = THREE.DoubleSide;
        this.scene.add(this.partialSphere);

        if (this.useOrientation) { //probably safest option for mobile
            this.controls = new DeviceOrientationControls(this.partialSphere, undefined, () => {
                this.lookAtSphere();
            });
            this.controls.update();
           
        } 

    }

    setupEventListeners() {

        window.addEventListener('resize', this.onWindowResize.bind(this));

    }

    static observedAttributes = [
        "styles","startFOV","startVideoFOV","maxFOV",
        "usePiSocket","useGyro","useOrientation",
        "resX","resY"
    ]; //just input a string for inline styles.

    initHTML = () => {
        
        this.shadowRoot.innerHTML = `
            <span style="${this.styles}">
                <style>
                    .slider-container {
                        font-family: Consolas;
                        position: relative;
                        top: 10px;
                        left: 10px;
                        z-index: 100;
                        font-size: 2vw;
                    }
                    .slider {
                        width: 200px;
                    }
                    canvas {
                        width: 100%;
                        height: auto;
                        transform: scaleX(-1);
                    }
                    video {
                        position:relative;
                        width:300px;
                        max-height:300px;
                        background-color:blue;
                        right:0;
                        top:0;
                        z-index:10;
                    }
                    .container {
                        max-height:100%;
                    }
                </style>
                <div class="container">
                    <div id="controls" class="slider-container">
                        Camera FOV (set to match your lens!): <input type="number" id="vfov" value="${this.startVideoFOV}"></input><button id="resetvfov">Reset</button><br/>
                        <div>Horizontal: <input type="range" id="ySlider" class="slider" min="-${Math.PI}" max="${Math.PI}" step="${this.startFOV*0.00005}" value="0"> Rate (rad/s):<input value="0" id="yRate" min="-${Math.PI}" max="${Math.PI}" type="number" step="${this.startFOV*0.0001}" /></div>
                        <div>Vertical: <input type="range" id="xSlider" class="slider" min="-${Math.PI}" max="${Math.PI}" step="${this.startFOV*0.00005}" value="0"> Rate (rad/s):<input value="0" id="xRate" min="-${Math.PI}" max="${Math.PI}" type="number" step="${this.startFOV*0.0001}" /></div>
                        <div>Tilt: <input type="range" id="zSlider" class="slider" min="-${Math.PI}" max="${Math.PI}" step="${this.startFOV*0.00005}" value="0"> Rate (rad/s):<input value="0" id="zRate" min="-${Math.PI}" max="${Math.PI}" type="number" step="${this.startFOV*0.0001}" /></div>
                        Starting Position: <select id="startpos">
                            <option value="center" selected>centered</option>
                            <option value="left">left</option>
                            <option value="right">right</option>
                        </select>
                        <button id="clear">Reset Image</button><br/>
                        Render FOV: <input id="fov" type="number" value="${this.startFOV}"/> Auto: <input id="autofov" type="checkbox"/>
                        <button id="resetfov">Reset</button>
                    </div>
                    <canvas></canvas>
                    ${!this.source ? '<video></video>' : ''}
                </div>
            </span>
        `;
        
        // Slider events
        if(this.hideControls) {
            this.shadowRoot.getElementById('controls').style.display = 'none';
        } else {
            this.shadowRoot.getElementById('xSlider').oninput = (e) => this.onXSliderChange(e.target.value);
            this.shadowRoot.getElementById('ySlider').oninput = (e) => this.onYSliderChange(e.target.value);
            this.shadowRoot.getElementById('zSlider').oninput = (e) => this.onZSliderChange(e.target.value);
            this.shadowRoot.getElementById('clear').onclick = () => { 
                this.resetRender();
            }
            this.shadowRoot.getElementById('startpos').onchange = () => {
                this.startPos = this.shadowRoot.getElementById('startpos').value;
                this.resetRender();
            }
            this.startPos = this.shadowRoot.getElementById('startpos').value;
            this.shadowRoot.getElementById('fov').onchange = (e) => this.onFovInpChange(e.target.value);
            this.shadowRoot.getElementById('resetfov').onclick = () => this.resetFOV();
            this.shadowRoot.getElementById('vfov').onchange = (e) => this.onVideoFovInpChange(e.target.value);
            this.shadowRoot.getElementById('resetvfov').onclick = () => this.resetVideoFOV();    
            this.shadowRoot.getElementById('autofov').onchange = (ev) => {
                this.autoAdjustFOV = ev.target.checked;
            }
        }
       
        // Attach the canvas and video element to the renderer and texture
        this.canvas = this.shadowRoot.querySelector('canvas');
        if(!this.source) this.source = this.shadowRoot.querySelector('video');


    }

    onXSliderChange = (value) => {
        //console.log(value);
        this.updateRotation('x', value);
    }
    onYSliderChange = (value) => {
        this.updateRotation('y', value);
    }
    onZSliderChange = (value) => {
        this.updateRotation('z', value);
    }
    onFovInpChange = (value) => {
        this.updateFOV(value);
    }
    onVideoFovInpChange = (value) => {
        this.updateVideoFOV(value);
    }

    resetRender = () => {
        if(this.partialSphere) {
            this.lookAtSphere();
            if(this.startPos !== 'center') {
                let fov = this.camera.fov;
                let vfov = this.sphereFOV;
                let diff = vfov - 0.75*fov;
                if(this.startPos === 'left') {
                    this.camera.rotateY(diff*Math.PI/180);
                } else {
                    this.camera.rotateY(-diff*Math.PI/180);
                }
            }
        }
        this.shadowRoot.getElementById('xSlider').value = 0;
        this.shadowRoot.getElementById('ySlider').value = 0;
        this.shadowRoot.getElementById('zSlider').value = 0;
        this.renderer.clear(); 
    }

    lookAtSphere = () => {
        // Assuming the point we are tracking on the sphere's surface is initially at (0, 0, 1) before rotation
        var initialDirection = new THREE.Vector3(0, 0, 1);
        var sphereCenter = this.partialSphere.position; // Center of the sphere
        var direction = initialDirection.clone().applyQuaternion(this.partialSphere.quaternion).normalize();

        // Now set the camera position to the center of the sphere
        this.camera.position.copy(sphereCenter);

        // Calculate a point in space in the direction we want the camera to look
        var lookAtPoint = new THREE.Vector3().addVectors(sphereCenter, direction);

        // Make the camera look in the direction of the sphere's rotation
        this.camera.lookAt(lookAtPoint);
        this.camera.rotation.z = 0;
        if(/(android)/i.test(navigator.userAgent)) {
            this.camera.rotation.z -= Math.PI/2;
        }
    }

    connectedCallback() {

        this.initHTML();

        if(!this.useWorkers) {
            if(!this.source) this.setDefaultVideo();

            this.createVideoTexture();
            
            this.setupScene();

            this.createPartialSphere(this.startVideoFOV);

            this.setupEventListeners();

            this.animating = true;
            this.lastUpdateTime = performance.now();

            this.animate();
            this.onVideoFrame();
        
            if(this.useGyro) {
                this.gyro = new Gyroscope({frequency:freq}); //we could do accel + gyro if we wanted to get weird.
                //use one or the other option
                this.gyro.addEventListener("reading", () => {
                    this.rotationRate.x += gyroscope.x; //rad/s
                    this.rotationRate.y += gyroscope.y;
                    this.rotationRate.z += gyroscope.z;
                    this.rotationRate.ticks++;
                });

                this.gyro.start();
            } else if (this.useOrientation) { //probably safest option for mobile
                //let controls = new THREE.DeviceOrientationControls(this.partialSphere);
            } else if (this.usePiSocket) { //a raspberry pi reporting over a websocket unless we can figure out what browser needs to recognize
                this.ws = new WebSocket('http://127.0.0.1:8181');
                this.ws.addEventListener('message',(ev)=>{
                    //let's just print a dict from the RPi
                    if(ev.data.length < 5) return;
                    const parsed = JSON.parse(ev.data);
                    this.renderThread.update();
                    this.rotationRate.x += parsed.x; //rad/s
                    this.rotationRate.y += parsed.y;
                    this.rotationRate.z += parsed.z;
                    this.rotationRate.ticks++;


                });
            }

        } else {
            this.initRenderThread()
        }


    }

    disconnectedCallback() {
        this.animating = false;
        this.destroy();
    }

    setDefaultVideo = () => {

        this.source.src = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        this.source.crossOrigin = "anonymous";
        this.source.onclick = () => this.togglePlayPause();
        this.source.load();
        this.source.muted = true;
        this.source.loop = true;

    }

    // Additional methods
    togglePlayPause() {

        if (!this.played) {
            this.played = true;
            this.source.play();
        } else {
            this.played = false;
            this.source.pause();
        }

    }

    createVideoTexture = () => {

        if("loop" in this.source) {
            this.renderTexture = new THREE.VideoTexture(this.source);
        } else if('getContext' in this.source) {
            this.renderTexture = new THREE.CanvasTexture(this.source);
        } else {
            this.renderTexture = new THREE.Texture(this.source); //image source
        }

        this.renderTexture.colorSpace = THREE.SRGBColorSpace; //
        this.renderMaterial = new THREE.MeshBasicMaterial({ map: this.renderTexture });
        this.renderTexture.repeat.set(-1, -1); // This will flip the texture horizontally to match source perspective
        this.renderTexture.offset.set(1, 1); // Offset needs to be adjusted when flipping
    }

    updateRotation = (axis, value) => {

        if (this.partialSphere) {
            this.partialSphere.rotation[axis] = parseFloat(value);
            if(this.autoAdjustFOV) this.updateCameraFOV();
        }

    }

    updateFOV(value) {

        let val = parseFloat(value);
        const newFOV = Math.min(this.maxFOV, val);
        this.camera.fov = newFOV;
        
        this.camera.updateProjectionMatrix();
        this.renderer.clear();
        this.shadowRoot.getElementById('xRate').value = 0;
        this.shadowRoot.getElementById('yRate').value = 0;
        this.shadowRoot.getElementById('zRate').value = 0;

    }

    resetFOV() {

        this.camera.fov = this.startFOV;
        this.camera.position.z = 0;
        this.shadowRoot.getElementById('fov').value = this.startFOV;
        this.camera.updateProjectionMatrix();
        this.shadowRoot.getElementById('xRate').value = 0;
        this.shadowRoot.getElementById('yRate').value = 0;
        this.shadowRoot.getElementById('zRate').value = 0;
        this.renderer.clear();
    }

    updateVideoFOV(value) {

        this.createPartialSphere(parseFloat(value));
        this.renderer.clear();

    }

    resetVideoFOV() {

        this.resetFOV();
        this.createPartialSphere(this.startVideoFOV);
        this.resetRender();
    }

    onWindowResize() {

        this.camera.aspect = Math.max(this.canvas.width,this.canvas.height)/Math.min(this.canvas.width,this.canvas.height);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.clear();

    }

    updatePartialSphereRotation() {

        // Assuming rotationRate values are updated elsewhere (e.g., via gyro or orientation events)
        if (this.rotationRate.ticks > 0) {
            this.partialSphere.rotation.x = this.rotationRate.rotX - this.rotationRate.initialX;
            this.partialSphere.rotation.y = this.rotationRate.rotY - this.rotationRate.initialY;
            this.partialSphere.rotation.z = this.rotationRate.rotZ - this.rotationRate.initialZ;
            this.rotationRate.ticks = 0;
        }

    }

    renderPartialSphereToTexture() {

        // Render the partial sphere to the render target
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);

    }

    updateCameraFOV() {

         // Calculate the new FOV based on rotation, for example:
        let val = 2*180 * (Math.abs(this.partialSphere.rotation.x) + Math.abs(this.partialSphere.rotation.y))/Math.PI;
        
        const newFOV = Math.min(
            this.maxFOV, val);
      
        if(newFOV > this.camera.fov) {
            // Update camera properties
            this.camera.fov = newFOV;
            this.camera.updateProjectionMatrix(); // This is necessary to apply the new FOV;
            this.renderer.clear();
            this.shadowRoot.getElementById('fov').value = newFOV;
        } else if(val > this.maxFOV) {
            //console.log(val);
        }


    }

    onVideoFrame = (now, metadata) => {

        if(!this.animating) return;
        //this.updatePartialSphereRotation();

        // Get the current time
        const currentTime = performance.now();
        // Calculate the elapsed time since the last frame in seconds
        const elapsedTime = (currentTime - this.lastUpdateTime) / 1000;
        // Update the last update time
        this.lastUpdateTime = currentTime;
        
        // Get the rotation rates from the inputs
        const xRate = parseFloat(this.shadowRoot.getElementById('xRate').value) || 0;
        const yRate = parseFloat(this.shadowRoot.getElementById('yRate').value) || 0;
        const zRate = parseFloat(this.shadowRoot.getElementById('zRate').value) || 0;

        // Update the sphere's rotation based on the rate and elapsed time
        this.partialSphere.rotation.x += xRate * elapsedTime;
        this.partialSphere.rotation.y += yRate * elapsedTime;
        this.partialSphere.rotation.z += zRate * elapsedTime;

        this.controls?.update(); //we need to update here so we aren't repainting frames in different positions
        if(this.partialSphere && this.autoAdjustFOV) this.updateCameraFOV();
        this.renderPartialSphereToTexture();

        if('requestVideoFrameCallback' in this.source) 
            this.source.requestVideoFrameCallback(this.onVideoFrame);

    }

    animate = () => {

        if(this.animating) {
            // Request the animation frame synced with the video frame event (onframe)
            //this.controls?.update();
            
            this.renderer.clearDepth();
            this.renderer.render(this.scene,this.camera);
            
            //this.composer.render(); //creates some issues with depth
            this.animationFrameId = requestAnimationFrame(this.animate);
        }

    }
}

customElements.define('spherical-video-renderer', SphericalVideoRenderer);