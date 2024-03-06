import {initPanoTool} from './src/panotool'

import "./index.css"


// let mode = document.createElement('button');
// mode.innerHTML = "Mode";
// mode.style.position = 'absolute'; mode.style.zIndex = "1000";
// mode.style.right = 0; mode.style.top = 0;

// let panotool;

// mode.onclick = () => {
//     if(panotool) {
//         panotool.deinit();
//         panotool = undefined;
//     } else {
//         panotool = initPanoTool();
//     }
// }

// document.body.appendChild(mode);

// mode.click();

panotool = initPanoTool();