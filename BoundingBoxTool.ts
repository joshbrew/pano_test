
//TODO: This doesn't play nice unless the video is centered. Need to fix that


export type Box = {
    rect:{x:number,y:number,width:number,height:number}, //coordinates are absolute image dimensions
    label:string,
    id:number|string
}

export type BBOptions = {
    color:string,
    labelColor:string,
    overlayCanvas?:HTMLCanvasElement, 
    maxBoxes?:number,
    oncreate?:(
        box:Box,
        boxes:Box[],
        sourceElement:HTMLImageElement|HTMLCanvasElement|HTMLVideoElement,
        overlay:HTMLCanvasElement|OffscreenCanvas,
        ctx:CanvasRenderingContext2D|OffscreenCanvas
    ) => void,
    ondelete?:( box:Box, boxes:Box[], boxIndex:number, sourceElement:HTMLImageElement|HTMLCanvasElement|HTMLVideoElement, overlay:HTMLCanvasElement, ctx:CanvasRenderingContext2D|OffscreenCanvas) => void,
    onedited?:( box:Box, boxes:Box[], boxIndex:number, sourceElement:HTMLImageElement|HTMLCanvasElement|HTMLVideoElement, overlay:HTMLCanvasElement, ctx:CanvasRenderingContext2D|OffscreenCanvas) => void
}

export class BoundingBoxTool {

    sourceElement:HTMLImageElement|HTMLCanvasElement|HTMLVideoElement;
    overlayCanvas:HTMLCanvasElement;
    ctx:CanvasRenderingContext2D;
    options:BBOptions;
    boxes:Box[]
    isDrawing:boolean;
    startX:number;
    startY:number;

    currentBox:any;
    currentBoxIndex:number;
    isResizing:boolean=false;
    resizingEdge:any;
    justFocused:boolean = false;
    resizeObserver?:ResizeObserver;
    originalWidth: number;
    originalHeight: number;

    constructor(
        sourceElement:HTMLImageElement|HTMLCanvasElement|HTMLVideoElement, 
        options:BBOptions
    ) {
        this.sourceElement = sourceElement;
        this.overlayCanvas = options.overlayCanvas ? options.overlayCanvas : document.createElement('canvas');
        if(!options.overlayCanvas) sourceElement.parentNode?.appendChild(this.overlayCanvas);
        this.ctx = this.overlayCanvas.getContext('2d') as CanvasRenderingContext2D;
        this.options = options || {};
        this.boxes = []; // Array to hold bounding boxes and their labels
    
        // Set up event listeners for drawing
        this.overlayCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.overlayCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.overlayCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.overlayCanvas.style.cursor = 'crosshair';
        // Bind the resizeCanvas method to the window resize event
        this.sourceElement.onload = () => {
            this.overlayCanvas.width = this.sourceElement.width;
            this.overlayCanvas.height = this.sourceElement.height;
        }

        this.resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
            if (entry.target === this.sourceElement) {
              this.resizeCanvas();
            }
          }
        });

        this.originalWidth = sourceElement.offsetWidth;
        this.originalHeight = sourceElement.offsetHeight;
        this.resizeObserver.observe(this.sourceElement);

        this.sourceElement.addEventListener('click',()=>{this.resizeCanvas();})//just to be sure as it should be over the top

        this.updateCanvasSize();
    
    }

    updateCanvasSize = () => {
        // Get the intrinsic dimensions of the source element
        const naturalWidth = (this.sourceElement instanceof HTMLVideoElement && this.sourceElement.videoWidth) || 
                             (this.sourceElement instanceof HTMLImageElement && this.sourceElement.naturalWidth) || 
                             this.sourceElement.width;

        const naturalHeight = (this.sourceElement instanceof HTMLVideoElement && this.sourceElement.videoHeight) || 
                              (this.sourceElement instanceof HTMLImageElement && this.sourceElement.naturalHeight) || 
                              this.sourceElement.height;

        // Get the layout dimensions
        const layoutWidth = this.sourceElement.clientWidth;
        const layoutHeight = this.sourceElement.clientHeight;
    
        // Calculate the scale factor
        const scaleX = layoutWidth / naturalWidth;
        const scaleY = layoutHeight / naturalHeight;

        // Choose the smaller scale to fit the canvas within the layout size
        const scale = Math.min(scaleX, scaleY); 

        // Scale canvas dimensions
        const scaleWidth = naturalWidth * scale;
        const scaleHeight = naturalHeight * scale;
    
        // Update canvas dimensions
        this.overlayCanvas.width = scaleWidth;
        this.overlayCanvas.height = scaleHeight;
    
        // Update canvas style dimensions to match the calculated size
        this.overlayCanvas.style.width = `${scaleWidth}px`;
        this.overlayCanvas.style.height = `${scaleHeight}px`;
    
        this.updateCanvasPosition();
    };
    
    updateCanvasPosition = () => {
    
        // Position the canvas absolutely within the viewport to align with the source element
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.left = '50%';
        this.overlayCanvas.style.transform = 'translateX(-50%)';
    };

    updateBoxesAndLabels = () => {
        const newWidth = this.overlayCanvas.offsetWidth;
        const newHeight = this.overlayCanvas.offsetHeight;

        let scale = this.getInverseScale();
        // Calculate scale based on the new dimensions
        const scaleX = newWidth / this.originalWidth;
        const scaleY = newHeight / this.originalHeight;

        // Update each box's position and dimensions based on the scale
        this.boxes = this.boxes.map(box => {
            const scaledX = box.rect.x * scaleX;
            const scaledY = box.rect.y * scaleY;
            const scaledWidth = box.rect.width * scaleX;
            const scaledHeight = box.rect.height * scaleY;

            // Update label positions
            this.updateLabelPosition(box);

            // Return the updated box
            return {
                ...box,
                rect: {
                    x: scaledX,
                    y: scaledY,
                    width: scaledWidth,
                    height: scaledHeight
                }
            };
        });

        // Update the original dimensions to the new size after resizing
        this.originalWidth = newWidth;
        this.originalHeight = newHeight;

        // Redraw the canvas to reflect the updated box positions and sizes
        this.redrawCanvas();
    };

    resizeCanvas = () => {
        this.updateCanvasSize();
        this.updateBoxesAndLabels(); // Add this line to handle box and label updates
    };

    findBoxEdge(mouseEvent) {
        const mousePos = { x: mouseEvent.offsetX, y: mouseEvent.offsetY };
        const threshold = 10; // pixels within the edge to consider for resizing
    
        for (let i = this.boxes.length - 1; i >= 0; i--) { // Start from the topmost box
            const box = this.boxes[i].rect;
            const edge = this.getResizingEdge(mousePos, box, threshold);
    
            if (Object.values(edge).includes(true)) { // If any edge is being resized
                this.resizingEdge = edge;
                return i; // Return the index of the box being resized
            }
        }
        return -1; // No box edge found near the mouse position
    }
    
    handleMouseDown(event) {
        if (this.justFocused) {
            this.justFocused = false; // Reset the flag
            return; // Exit the function to avoid drawing a new box
        }
    
        const canvasRect = this.overlayCanvas.getBoundingClientRect();
        this.startX = event.clientX - canvasRect.left;
        this.startY = event.clientY - canvasRect.top;
    
        const clickedBoxIndex = this.findBoxEdge(event);
        if (clickedBoxIndex !== -1) {
            this.isDrawing = false;
            this.isResizing = true;
            this.currentBoxIndex = clickedBoxIndex;
            this.currentBox = this.boxes[clickedBoxIndex];
        } else {
            this.isDrawing = true;
        }
    }
      
    handleMouseMove(event) {
        const canvasRect = this.overlayCanvas.getBoundingClientRect();
        const mouseX = event.clientX - canvasRect.left;
        const mouseY = event.clientY - canvasRect.top;

        if (this.isResizing) {
            this.resizeBox({ offsetX: mouseX, offsetY: mouseY }, this.currentBox.rect, this.resizingEdge);
            this.redrawCanvas();
        } else if (this.isDrawing) {
            this.redrawCanvas();
            this.drawBoundingBox(this.startX, this.startY, mouseX - this.startX, mouseY - this.startY);
        }
    }
      
    handleMouseUp(event) {
        if (this.isResizing) {
            this.isResizing = false;
            if (this.options.onedited) {
                this.options.onedited(this.currentBox, this.boxes, this.boxes.findIndex((v)=>{if(this.currentBox.id === v.id) return true;}), this.sourceElement, this.overlayCanvas, this.ctx);
            }
        } else if (this.isDrawing) {
            this.isDrawing = false;
    
            const canvasRect = this.overlayCanvas.getBoundingClientRect();
            const endX = event.clientX - canvasRect.left;
            const endY = event.clientY - canvasRect.top;
    
            if (Math.abs(endX - this.startX) > 0 && Math.abs(endY - this.startY) > 0) {
                const newBox = {
                    rect: this.getBoundingBoxRect(this.startX, this.startY, endX, endY),
                    label: '',
                    id: `${Math.floor(Math.random()*1000000000000000)}`
                };

                if(this.options.maxBoxes) {
                    if(this.boxes.length >= this.options.maxBoxes) {
                        while(this.boxes.length >= this.options.maxBoxes) this.deleteBox(this.boxes[0].id);
                    }
                }

                this.boxes.push(newBox);
                this.createLabelInput(newBox);
                this.redrawCanvas();
                if (this.options.oncreate) {
                    this.options.oncreate(newBox, this.boxes, this.sourceElement, this.overlayCanvas, this.ctx);
                }
            }
        }
    }
    
    getScale = () => {
        const sourceWidth = (this.sourceElement as HTMLImageElement).naturalWidth || (this.sourceElement as HTMLVideoElement).videoWidth || this.sourceElement.width;
        const sourceHeight = (this.sourceElement as HTMLImageElement).naturalHeight || (this.sourceElement as HTMLVideoElement).videoHeight || this.sourceElement.height;
        return {
          x: sourceWidth / this.overlayCanvas.width,
          y: sourceHeight / this.overlayCanvas.height
        };
    }
  
    getInverseScale = () => {
        const scale = this.getScale();
        return {
            x: 1 / scale.x,
            y: 1 / scale.y
        };
    };
    
    getBoundingBoxRect = (x0, y0, x1, y1) => {
        const scale = this.getScale();
        let left = Math.min(x0, x1) * scale.x;
        let top = Math.min(y0, y1) * scale.y;
        let right = Math.max(x0, x1) * scale.x;
        let bottom = Math.max(y0, y1) * scale.y;

        return {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top
        };
    };

    drawBoundingBox = (x, y, width, height) => {
        this.ctx.beginPath();
        this.ctx.lineWidth = 2;
        this.ctx.rect(x, y, width, height);
        this.ctx.strokeStyle = this.options.color || 'orange';
        this.ctx.stroke();
    }
    
    redrawCanvas = () => {
        // Clear the entire canvas
        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
        // Calculate the inverse scale factors
        const inverseScale = this.getInverseScale();
    
        // Redraw each box with the updated dimensions, adjusted for the canvas scale
        this.boxes.forEach(box => {
            // Scale the box's dimensions to fit the canvas
            const scaledX = box.rect.x * inverseScale.x;
            const scaledY = box.rect.y * inverseScale.y;
            const scaledWidth = box.rect.width * inverseScale.x;
            const scaledHeight = box.rect.height * inverseScale.y;
    
            this.drawBoundingBox(scaledX, scaledY, scaledWidth, scaledHeight);
    
            // Update the label position and draw it
            if (box.label) {
                this.drawLabel(box);
            }
        });
    };

    getResizingEdge(mousePos, boxRect, threshold) {
        let edge = {
            top: false,
            right: false,
            bottom: false,
            left: false
        };

        let scale = this.getInverseScale();

        // Scale the box's coordinates and dimensions to the canvas coordinate system
        const scaledBoxRect = {
            x: boxRect.x * scale.x,
            y: boxRect.y * scale.y,
            width: boxRect.width * scale.x,
            height: boxRect.height * scale.y
        };
        // Expand the box's effective area for edge detection by the threshold
        const insideHorizontalBounds = mousePos.x >= (scaledBoxRect.x*scale.x - threshold) && mousePos.x <= (scaledBoxRect.x + scaledBoxRect.width + threshold);
        const insideVerticalBounds = mousePos.y >= (scaledBoxRect.y - threshold) && mousePos.y <= (scaledBoxRect.y + scaledBoxRect.height + threshold);

        // Determine proximity to each edge
        // Determine proximity to each edge, considering if the mouse is inside the expanded box boundaries
        if (insideHorizontalBounds) {
            if (Math.abs(mousePos.y - scaledBoxRect.y) < threshold) {
                edge.top = true;
            } else if (Math.abs((scaledBoxRect.y + scaledBoxRect.height) - mousePos.y) < threshold) {
                edge.bottom = true;
            }
        }
        
        if (insideVerticalBounds) {
            if (Math.abs(mousePos.x - scaledBoxRect.x) < threshold) {
                edge.left = true;
            } else if (Math.abs((scaledBoxRect.x + scaledBoxRect.width) - mousePos.x) < threshold) {
                edge.right = true;
            }
        }

        // // Check for corners and prioritize them (or not)
        // if (edge.top && edge.left) {
        //     edge.bottom = edge.right = false; // Top-left corner
        // } else if (edge.top && edge.right) {
        //     edge.bottom = edge.left = false; // Top-right corner
        // } else if (edge.bottom && edge.left) {
        //     edge.top = edge.right = false; // Bottom-left corner
        // } else if (edge.bottom && edge.right) {
        //     edge.top = edge.left = false; // Bottom-right corner
        // }
        
        return edge;
    }


    resizeBox = (mouseEvent, boxRect, resizingEdge) => {
        const scale = this.getScale();
        const mouseX = mouseEvent.offsetX * scale.x;
        const mouseY = mouseEvent.offsetY * scale.y;
    
        const dx = mouseX - this.startX * scale.x;
        const dy = mouseY - this.startY * scale.y;

        if (resizingEdge.right) {
            boxRect.width += dx;
        } else if (resizingEdge.left) {
            boxRect.width -= dx;
            boxRect.x += dx;
        }

        if (resizingEdge.bottom) {
            boxRect.height += dy;
        } else if (resizingEdge.top) {
            boxRect.height -= dy;
            boxRect.y += dy;
        }

        // Normalize box dimensions to always be positive
        if (boxRect.width < 0) {
            boxRect.x += boxRect.width;
            boxRect.width = -boxRect.width;
        }
        if (boxRect.height < 0) {
            boxRect.y += boxRect.height;
            boxRect.height = -boxRect.height;
        }

        // Update label position for the resized box
        this.updateLabelPosition(this.currentBox);

        // Update start position for next calculation
        this.startX = mouseEvent.offsetX;
        this.startY = mouseEvent.offsetY;
    }
  
    updateLabelPosition = (box) => {
        const labelContainer = document.getElementById(`label_container_${box.id}`);
    
        if (labelContainer) {
            const scale = this.getInverseScale();
            const canvasOffset = this.overlayCanvas.getBoundingClientRect(); // Get canvas position relative to viewport
    
            let labelX = (box.rect.x * scale.x) + canvasOffset.left; // Position relative to canvas
            let labelY = (box.rect.y * scale.y) + canvasOffset.top - 35;  // Initially position above the box
    
            // Adjust if label goes above the canvas
            if (labelY < canvasOffset.top + 20) {
                labelY = (box.rect.y * scale.y) + box.rect.height * scale.y + canvasOffset.top + 10;
            }
    
            // Ensure label stays within the horizontal bounds of the canvas
            labelX = Math.max(canvasOffset.left, Math.min(labelX, canvasOffset.left + this.overlayCanvas.width - labelContainer.offsetWidth));
    
            labelContainer.style.left = `${labelX}px`;
            labelContainer.style.top = `${labelY}px`; // Adjusted position above or below the box
        }
    };

    drawLabel = (box) => {
        // Attempt to find an existing label container
        let labelContainer = document.getElementById(`label_container_${box.id}`) as HTMLElement;
        
        // If no existing label container, create it
        if (!labelContainer) {
            labelContainer = document.createElement('div');
            labelContainer.id = `label_container_${box.id}`;
            labelContainer.style.position = 'absolute';

            labelContainer.style.color = this.options.labelColor || 'black';
            labelContainer.style.zIndex = '1000';
            labelContainer.style.display = 'flex';
            labelContainer.style.alignItems = 'center';

            document.body.appendChild(labelContainer);
        } else {
            // Clear the label container if it already exists
            labelContainer.innerHTML = '';
        }
    
       
        // Update label position based on the scaled and positioned box
        this.updateLabelPosition(box);

        // Create the delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'X';
        deleteBtn.style.marginRight = '5px';
        deleteBtn.onclick = () => {
            this.deleteBox(box.id);
        };
        labelContainer.appendChild(deleteBtn);
    
        // Create the label span
        const labelSpan = document.createElement('span');
        labelSpan.textContent = box.label || 'Edit'; // Default text if no label
        labelSpan.style.padding = '2px 4px';
        labelSpan.style.cursor = 'text';
        labelSpan.style.minWidth = '20px'; // Minimum clickable area
        labelSpan.onclick = () => {
            // Replace label with an editable input
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = box.label;
            labelInput.style.border = 'none';
            labelInput.style.padding = '2px 4px';

            let keydownlistener = (e) => {
                if (e.key === 'Enter') {
                    labelInput.blur(); // Save on Enter key
                }
            }

            window.addEventListener('keydown', keydownlistener);
            // Handle when user finishes editing
            labelInput.onblur = () => {
                window.removeEventListener('keydown',keydownlistener)
                this.justFocused = false;
                const prevLabel = box.label;
                box.label = labelInput.value;
                labelSpan.textContent = box.label || 'Edit';
                labelSpan.style.textShadow = '1px 2px red, 0 0 1em blue, 0 0 0.2em blue';
                
                labelContainer.replaceChild(labelSpan, labelInput);
                this.redrawCanvas();
                if (prevLabel !== box.label && this.options.onedited) {
                    this.options.onedited(box, this.boxes, this.boxes.findIndex((v)=>{if(box.id === v.id) return true;}), this.sourceElement, this.overlayCanvas, this.ctx);
                }
            };

            labelInput.onfocus = () => {
                // When label input is focused, reset the justFocused flag
                this.justFocused = true;
            };
            
            labelContainer.replaceChild(labelInput, labelSpan);
            labelInput.focus();
        };
        
        labelContainer.appendChild(labelSpan);

        return {labelContainer, labelSpan};
    };
    
    createLabelInput = (box) => {
        // No need to create an input here as the label is created in drawLabel
        let {labelSpan} = this.drawLabel(box);
        labelSpan.click();
    };
    
    updateLabelProgrammatically = (boxId, newLabel) => {
        const labelContainer = document.getElementById(`label_container_${boxId}`);
        if (!labelContainer) {
            //console.warn(`Label container for box ID ${boxId} not found.`);
            return;
        }
    
        // Check if label input exists and is focused, then blur it
        const labelInput = labelContainer.querySelector('input');
        if (labelInput && document.activeElement === labelInput) {
            labelInput.blur();
        }
    
        // Find the label span within the container
        const labelSpan = labelContainer.querySelector('span');
        if (!labelSpan) {
            console.warn(`Label span for box ID ${boxId} not found.`);
            return;
        }
    
        // Update the label text
        labelSpan.textContent = newLabel || 'Edit';
    
        // Update the box object with the new label
        const boxIndex = this.boxes.findIndex(box => box.id === boxId);
        if (boxIndex !== -1) {
            this.boxes[boxIndex].label = newLabel;
            if (this.options.onedited) {
                this.options.onedited(this.boxes[boxIndex], this.boxes, boxIndex, this.sourceElement, this.overlayCanvas, this.ctx);
            }
        } else {
            console.warn(`Box with ID ${boxId} not found.`);
        }
    };

    deleteBox = (id) => {
      const index = this.boxes.findIndex(box => box.id === id);
      if (index !== -1) {
        let spliced = this.boxes.splice(index, 1);
        const labelContainer = document.getElementById(`label_container_${id}`);
        if (labelContainer) document.body.removeChild(labelContainer);
        this.redrawCanvas();
        if(this.options.ondelete) this.options.ondelete(spliced[0], this.boxes, index, this.sourceElement, this.overlayCanvas, this.ctx);
      }
    }

    // Add the new methods here within the class definition
    clearBoundingBoxes(deleteCanvas?) {
        this.boxes.forEach(box => {
            const labelContainer = document.getElementById(`label_container_${box.id}`);
            if (labelContainer) {
                document.body.removeChild(labelContainer);
            }
        });

        this.boxes = [];
        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
        if(deleteCanvas) this.deleteCanvas();
    }

    deleteCanvas() {
        if (this.overlayCanvas && this.overlayCanvas.parentNode) {
            this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
        }
        if (this.resizeObserver) {
            this.resizeObserver.unobserve(this.sourceElement);
            this.resizeObserver = undefined;
        }
    }
  }