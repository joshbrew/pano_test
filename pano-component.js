import * as THREE from 'three'
// import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
// import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';

export class SphericalVideoRenderer extends HTMLElement {
    // Class properties
    sampleFreq = 60;
    useOrientation = true;
    useGyro = false;
    usePiSocket = false;
    maxFOV = 120; // fisheye effect limit
    startFOV = 75;
    startVideoFOV = 20;
    video;
    resX;
    resY;

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

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    setupScene() {

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            this.startFOV, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.z = 0;
        this.camera.rotation.y = Math.PI;

        this.renderer = new THREE.WebGLRenderer({ alpha:true, canvas: this.canvas, preserveDrawingBuffer: true, antialias:true });
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new THREE.Color("rgb(0,0,0)"),0);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.shadowRoot.appendChild(this.renderer.domElement);
        
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

    disposeMaterial(material) {
        material.dispose();
    }


    createPartialSphere(fov) {

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
        }

        this.partialSphere = new THREE.Mesh(partialSphereGeometry, this.renderMaterial);
        this.scene.add(this.partialSphere);
        this.partialSphere.material.side = THREE.DoubleSide;

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
                        position: relative;
                        top: 10px;
                        left: 10px;
                        z-index: 100;
                    }
                    .slider {
                        width: 200px;
                    }
                    canvas {
                        width: 100%;
                        height: auto;
                    }
                    video {
                        position:relative;
                        width:250px;
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
                    <div class="slider-container">
                        <div>X Rotation: <input type="range" id="xSlider" class="slider" min="-1.8" max="1.8" step="0.01" value="0"></div>
                        <div>Y Rotation: <input type="range" id="ySlider" class="slider" min="-1.8" max="1.8" step="0.01" value="0"></div>
                        <div>Z Rotation: <input type="range" id="zSlider" class="slider" min="-1.8" max="1.8" step="0.01" value="0"></div>
                        <button id="clear">Reset Image</button>
                        Render FOV: <input id="fov" type="number" value="${this.startFOV}"></input>
                        <button id="resetfov">Reset</button>
                        <br/>Video Feed FOV: <input type="number" id="vfov" value="${this.startVideoFOV}"></input>
                        <button id="resetvfov">Reset</button>
                    </div>
                    <canvas></canvas>
                    ${!this.source ? '<video></video>' : ''}
                </div>
            </span>

        `;
        
        // Slider events
        this.shadowRoot.getElementById('xSlider').oninput = (e) => this.updateRotation('x', e.target.value);
        this.shadowRoot.getElementById('ySlider').oninput = (e) => this.updateRotation('y', e.target.value);
        this.shadowRoot.getElementById('zSlider').oninput = (e) => this.updateRotation('z', e.target.value);
        this.shadowRoot.getElementById('clear').onclick = () => { 
            this.renderer.clear(); 
            if(this.partialSphere) {
                this.partialSphere.rotation.x = 0;
                this.partialSphere.rotation.y = 0;
                this.partialSphere.rotation.z = 0;
            }
        }
        this.shadowRoot.getElementById('fov').onchange = (e) => this.updateFOV(e.target.value);
        this.shadowRoot.getElementById('resetfov').onclick = () => this.resetFOV();
        this.shadowRoot.getElementById('vfov').onchange = (e) => this.updateVideoFOV(e.target.value);
        this.shadowRoot.getElementById('resetvfov').onclick = () => this.resetVideoFOV();
            
        // Attach the canvas and video element to the renderer and texture
        this.canvas = this.shadowRoot.querySelector('canvas');
        if(!this.source) this.source = this.shadowRoot.querySelector('video');

    }

    connectedCallback() {

        this.initHTML();

        if(!this.source) this.setDefaultVideo();

        this.createVideoTexture();
        
        this.setupScene();

        this.createPartialSphere(this.startVideoFOV);

        this.setupEventListeners();

        this.animating = true;

        this.animate();

        this.onVideoFrame();

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

        this.renderTexture.encoding = 3001; //srgb for correct saturation
        this.renderMaterial = new THREE.MeshBasicMaterial({ map: this.renderTexture });
        this.renderTexture.repeat.set(-1, 1); // This will flip the texture horizontally to match source perspective
        this.renderTexture.offset.set(1, 0); // Offset needs to be adjusted when flipping
    }

    updateRotation = (axis, value) => {

        if (this.partialSphere) {
            this.partialSphere.rotation[axis] = parseFloat(value);
            this.updateCameraFOV();
        }

    }

    updateFOV(value) {

        const newFOV = Math.min(this.maxFOV, parseFloat(value));
        this.camera.fov = newFOV;
        this.camera.updateProjectionMatrix();
        this.renderer.clear();

    }

    resetFOV() {

        this.camera.fov = this.startFOV;
        this.camera.updateProjectionMatrix();
        this.renderer.clear();

    }

    updateVideoFOV(value) {

        this.createPartialSphere(parseFloat(value));
        this.renderer.clear();

    }

    resetVideoFOV() {

        this.createPartialSphere(this.startVideoFOV);
        this.renderer.clear();

    }

    onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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
        const newFOV = Math.min(
            this.maxFOV, 2*180 * (Math.abs(this.partialSphere.rotation.x) + Math.abs(this.partialSphere.rotation.y))/Math.PI);
        
        if(newFOV > this.camera.fov) {
            // Update camera properties
            this.camera.fov = newFOV;
            this.camera.updateProjectionMatrix(); // This is necessary to apply the new FOV;
            this.renderer.clear();
            this.shadowRoot.getElementById('fov').value = newFOV;
        }

    }

    onVideoFrame = () => {

        if(!this.animating) return;
        this.updatePartialSphereRotation();
        if(this.partialSphere) this.updateCameraFOV();
        this.renderPartialSphereToTexture();

        if('requestVideoFrameCallback' in this.source) 
            this.source.requestVideoFrameCallback(this.onVideoFrame.bind(this));

    }

    animate = () => {

        if(this.animating) {
            // Request the animation frame synced with the video frame event (onframe)
            this.renderer.clearDepth();
            this.renderer.render(this.scene,this.camera);
            //this.composer.render(); //creates some issues with depth
            this.animationFrameId = requestAnimationFrame(this.animate);
        }

    }
}

customElements.define('spherical-video-renderer', SphericalVideoRenderer);