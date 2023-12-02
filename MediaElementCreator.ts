import './videocontrols.css'

type CB = (
  srcOrId?:string|MediaProvider|null, 
  videoOrImage?:HTMLVideoElement|HTMLImageElement
)=>void

export class MediaElementCreator {
  fileInput: HTMLInputElement;
  videoSelect: HTMLSelectElement;
  parentElement:HTMLElement;
  mediaOptions: MediaStreamConstraints;
  currentMediaElement: HTMLImageElement | HTMLVideoElement | null = null;
  oncreate?: CB;
  onstarted?: CB;
  ondelete?: CB;
  onended?: CB;
  ontargetchanged?: CB;

  constructor(
    parentElement: HTMLElement,
    callbacks?: {
      oncreate?: CB,
      onstarted?: CB,
      ondelete?: CB,
      onended?: CB,
      ontargetchanged?: CB
    },
    mediaOptions?: MediaStreamConstraints,
    autostart=true
  ) {
    this.parentElement = parentElement;
    this.mediaOptions = mediaOptions || {
      audio: false,
      video: {
        optional:[
          {minWidth: 320},
          {minWidth: 640},
          {minWidth: 1024},
          {minWidth: 1280},
          {minWidth: 1920},
          {minWidth: 2560},
          {minWidth: 3840},
        ]
      } as any
    };
    
    this.oncreate = callbacks?.oncreate;
    this.onstarted = callbacks?.onstarted;
    this.ondelete = callbacks?.ondelete;
    this.ontargetchanged = callbacks?.ontargetchanged;

    let controlsDiv = document.createElement('div');
    this.parentElement.appendChild(controlsDiv);

    this.createFileInputElement(controlsDiv);
    this.createVideoSelectElement(controlsDiv);

    if(autostart)
      setTimeout(()=>{ //give it a moment to enumerate
        if(this.videoSelect.value) this.getVideoStream({
          audio:false,
          video:{
            width:{ min:480, ideal:3840},
            height:{ min:320, ideal:2160},
            deviceId:this.videoSelect.value as string
          }});
      },100);
  }

  createFileInputElement(parent:HTMLElement) {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*, video/*';
    this.fileInput.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files[0]) {
            const file = target.files[0];
            this.createMediaElement(file);
        }
    });
    this.fileInput.onclick = (ev:any) => {
      this.fileInput.value = "";
    }
    parent.appendChild(this.fileInput);
  }

  createVideoSelectElement(parent:HTMLElement) {
    this.videoSelect = document.createElement('select');
    this.setupVideoInputOptions();
    parent.appendChild(this.videoSelect);
    let button = document.createElement('button');
    button.innerHTML = "Stream";
    button.onclick = () => {
      this.setStream();
    }
    parent.appendChild(button);
  }

  setStream = () => {
    const options: MediaStreamConstraints = {
      ...this.mediaOptions,
      video: { 
        width:{ min:480, ideal:3840},
        height:{ min:320, ideal:2160},
        deviceId:this.videoSelect.value
      } as any
    };
    this.getVideoStream(options);
  }

  async setupVideoInputOptions() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    this.videoSelect.innerHTML = videoDevices
      .map(device => `<option value="${device.deviceId}">${device.label || device.deviceId}</option>`)
      .join('');

    this.videoSelect.addEventListener('change', this.setStream);
  }

  async getVideoStream(options: MediaStreamConstraints) {
    try {

      const stream = await navigator.mediaDevices.getUserMedia(options);
      
      //no ios
      //const track = stream.getVideoTracks()[0];
      //let capture = new ImageCapture(track);
      //let capabilities = Promise.all([capture.getPhotoCapabilities(), capture.getPhotoSettings()]);
      //capabilities.then((res)=>{console.log("CAPTURE CAPABILITIES: ",...res);});

      this.createVideoElement(stream, (options?.video as any)?.deviceId);
    } catch (error) {
      console.error('Error accessing the webcam', error);
    }
  }

  createMediaElement(file: File) {
    const url = URL.createObjectURL(file);
    if(this.oncreate) this.oncreate(file.name, undefined);
    
    if (file.type.startsWith('image/')) {
      this.createImageElement(url);
    } else if (file.type.startsWith('video/')) {
      this.createVideoElement(url);
    } else {
      console.error('Unsupported file type:', file.type);
    }
  }

  createImageElement(src: string) {
    const image = new Image();
    image.src = src;
    image.onload = () => {
      this.deinitMediaElement();
      this.parentElement.appendChild(image);
      this.currentMediaElement = image;
      if(this.ontargetchanged) this.ontargetchanged(src, image);
    };
  }

  createVideoElement(src: string | MediaStream, deviceId?: string) {

    this.deinitMediaElement();

    const video = document.createElement('video');
    video.classList.add('video-element');
    video.autoplay = true;

    video.loop = true;
    video.muted = true; // Mute to allow autoplay without user interaction
    
    
    if (typeof src === 'string') {
      video.src = src;
      if(this.oncreate) this.oncreate(src, video);
    } else {
      video.srcObject = src;
      video.onloadedmetadata = () => {
        if(this.onstarted) this.onstarted(deviceId, video);
      };
    }
    
    video.onplay = () => {
      if(this.onstarted) this.onstarted(deviceId || video.src, video);
    };

    video.onended = () => {
      if(this.onended) this.onended(video.src || deviceId, video);
    };

        // Create a container for the video and controls
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.appendChild(video);

    if(!deviceId) {
      // Create controls
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'video-controls';

      const playPauseBtn = document.createElement('button');
      playPauseBtn.innerText = '⏸️';
      playPauseBtn.onclick = () => {
          if (video.paused) {
              video.play();
              playPauseBtn.innerText = '⏸️';
          } else {
              video.pause();
              playPauseBtn.innerText = '▶️';
          }
      };

      const seekSlider = document.createElement('input');
      seekSlider.type = 'range';
      seekSlider.min = '0';
      seekSlider.max = '100';
      seekSlider.value = '0';
      seekSlider.oninput = (e) => {
          const seekTo = video.duration * (+seekSlider.value / 100);
          video.currentTime = seekTo;
      };

      video.ontimeupdate = () => {
          seekSlider.value = String((video.currentTime / video.duration) * 100);
      };

      controlsDiv.appendChild(playPauseBtn);
      controlsDiv.appendChild(seekSlider);

      videoContainer.appendChild(controlsDiv);
    }
    
    videoContainer.appendChild(video);
    this.parentElement.appendChild(videoContainer);

    this.currentMediaElement = video;
    if(this.ontargetchanged) this.ontargetchanged(deviceId || video.src, video);
  }

  deinitMediaElement() {
    if (this.currentMediaElement) {
      if (this.currentMediaElement instanceof HTMLVideoElement && this.currentMediaElement.srcObject) {
        const tracks = (this.currentMediaElement.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      if(this.ondelete) this.ondelete(this.currentMediaElement.src || (this.currentMediaElement as HTMLVideoElement).srcObject, this.currentMediaElement);
      this.currentMediaElement.parentElement?.remove();
      this.currentMediaElement = null;
    }
  }
  
}