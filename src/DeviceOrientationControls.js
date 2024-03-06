import * as THREE from 'three'
/**
 * @author richt / http://richt.me  
 * @author WestLangley / http://github.com/WestLangley
 * @author JoshBrewster / https://github.com/joshbrew (updated)
 * W3C Device Orientation control (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
 */

export function isMobile() {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
};

export function isAndroid() { //https://stackoverflow.com/questions/6031412/detect-android-phone-via-javascript-jquery
    const device = navigator.userAgent.toLowerCase();
    return device.indexOf("android") > -1; 
}


const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around the x-axis


export class DeviceOrientationControls {
    object = null;
    enabled = true;
    deviceOrientation = undefined;
    screenOrientation = typeof screen !== 'undefined' ? screen.orientation.angle || 0 : 0;
    portraitMode = typeof screen !== 'undefined' ? screen.orientation.type : isMobile() ? 'landscape-primary' : '';//|| 'landscape-primary' : 'landscape-primary';
    alpha = 0;
    beta = 0;
    gamma = 0;
    firstCall = true;
    offsetDeg = 0; // Assuming default value, adjust as necessary
    firstEvent = null; // Assuming default value, adjust as necessary
    onEvent = null; // Assuming default value, adjust as necessary
    canvas = null; // Assuming default value, adjust as necessary
    initialQuaternion = new THREE.Quaternion();
    samples = []; //sample buffer
    maxSamples = 30; //rolling buffer


    offset = {alpha:0, beta:0, gamma: 0}; //offset used for calibration
    samplesSinceOffset = 0;

    constructor(object, offsetDeg, firstEvent, onEvent, canvas) {
        this.object = object;
        this.object.rotation.reorder("YXZ");
        this.offsetDeg = offsetDeg;
        this.firstEvent = firstEvent;
        this.onEvent = onEvent;
        this.canvas = canvas;

        // Set the initial quaternion based on the object's current rotation
        this.initialQuaternion.copy(this.object.quaternion);

        // Auto-connect on instantiation
        this.connect();
    }

	reset() {
		
	}

    onDeviceOrientationChangeEvent = (event) => {
        this.deviceOrientation = event;
    };

    onScreenOrientationChangeEvent = (ev) => {
        this.screenOrientation = ev.target.angle;
        this.portraitMode = ev.target.type;
    };

    setObjectQuaternion = (quaternion, alpha, beta, gamma, orient) => {

        //swap axes
        if(this.portraitMode.includes('landscape')) {
            let b = beta; 
            beta = gamma;
            gamma = b;
            
        }

		euler.set(beta, alpha, -gamma, 'YXZ');
		quaternion.setFromEuler(euler);
		quaternion.multiply(q1);
		quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
		//quaternion.premultiply(this.initialQuaternion); // Apply the initial orientation
	};

    calibrate = () => {
        if (this.samples.length > 1) { // Ensure we have at least 2 samples to calculate rate of change
            const rateOfChange = { alpha: 0, beta: 0, gamma: 0 };
            let previousSample = this.samples[0];

            // Use the first half of the buffer
            const halfLen = Math.floor(this.samples.length * 0.5);
            for (let i = 1; i < halfLen; i++) { // Start from 1 since we're comparing with the previous
                const currentValue = this.samples[i];

                // Calculate rate of change
                rateOfChange.alpha += (currentValue.alpha - previousSample.alpha);
                rateOfChange.beta += (currentValue.beta - previousSample.beta);
                rateOfChange.gamma += (currentValue.gamma - previousSample.gamma);

                previousSample = currentValue;
            }

            // Compute average rate of change per sample
            this.offset = {
                alpha: rateOfChange.alpha / (halfLen - 1),
                beta: rateOfChange.beta / (halfLen - 1),
                gamma: rateOfChange.gamma / (halfLen - 1),
            };

            this.samplesSinceOffset = 0;
        }
    }

    update = () => {
        if (!this.enabled || !this.deviceOrientation) return;

        const { alpha, beta, gamma } = this.deviceOrientation;

        if('alpha' in this.deviceOrientation) 
            this.samples.push({alpha, beta, gamma});
        else return; //no samples

        this.samplesSinceOffset++;

        if(this.samples.length > this.maxSamples) 
            this.samples.shift();

        if (typeof alpha === 'number') {
            const orient = THREE.MathUtils.degToRad(this.screenOrientation || 0);
            const radAlpha = THREE.MathUtils.degToRad((alpha - (this.offset.alpha*this.samplesSinceOffset)) || 0);
            const radBeta = THREE.MathUtils.degToRad((beta - (this.offset.beta*this.samplesSinceOffset)) || 0);
            const radGamma = THREE.MathUtils.degToRad((gamma - (this.offset.gamma*this.samplesSinceOffset)) || 0);

            if (radAlpha === this.alpha && radBeta === this.beta && radGamma === this.gamma) return;

            this.alpha = radAlpha;
            this.beta = radBeta;
            this.gamma = radGamma;

            this.setObjectQuaternion(this.object.quaternion, radAlpha, radBeta, radGamma, orient);

            if (this.firstCall && this.firstEvent) {
                this.firstCall = false;
                this.firstEvent(this.object, this.deviceOrientation, this.screenOrientation, this.portraitMode);
            }

            if (this.onEvent) {
                this.onEvent(this.object, this.deviceOrientation, this.screenOrientation, this.portraitMode);
            }
        }

        
        this.deviceOrientation = undefined;
    };

    connect = () => {
        if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
            this.canvas.addEventListener('orientation', this.onScreenOrientationChangeEvent, false);
            this.canvas.addEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
        } else {
            screen?.orientation.addEventListener('change', this.onScreenOrientationChangeEvent, false);
            window.addEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
        }
        this.enabled = true;
    };

    disconnect = () => {
        if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
            this.canvas.removeEventListener('orientation', this.onScreenOrientationChangeEvent, false);
            this.canvas.removeEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
        } else {
            screen?.orientation.removeEventListener('change', this.onScreenOrientationChangeEvent, false);
            window.removeEventListener('deviceorientation', this.onDeviceOrientationChangeEvent, false);
        }
        this.enabled = false;
    };

    dispose = () => {
        this.disconnect();
    };
}