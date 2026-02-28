// Sidebar management module
let sidebarIframe = null;
let resizeHandle = null;
let isOpen = false;
let isResizing = false;
let currentWidth = parseInt(localStorage.getItem('sidebarWidth')) || 400;

const MIN_WIDTH = 320;
const MAX_WIDTH = 1000;

export function createSidebar() {
  if (sidebarIframe) return;

  // Create iframe for the sidebar
  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = 'counselreflect-sidebar';
  sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
  sidebarIframe.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${currentWidth}px;
    height: 100vh;
    border: none;
    z-index: 2147483647;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  `;

  // Create resize handle
  resizeHandle = document.createElement('div');
  resizeHandle.id = 'sidebar-resize-handle';
  resizeHandle.style.cssText = `
    position: fixed;
    top: 0;
    right: ${currentWidth}px;
    width: 16px;
    height: 100vh;
    cursor: ew-resize;
    z-index: 2147483648;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out, background-color 0.2s;
    background: transparent;
    margin-right: -8px;
  `;
  
  // Add hover effect
  resizeHandle.addEventListener('mouseenter', () => {
    if (isOpen) {
      resizeHandle.style.background = 'rgba(99, 102, 241, 0.3)';
      resizeHandle.style.borderLeft = '2px solid rgba(99, 102, 241, 0.6)';
    }
  });
  
  resizeHandle.addEventListener('mouseleave', () => {
    if (!isResizing) {
      resizeHandle.style.background = 'transparent';
      resizeHandle.style.borderLeft = 'none';
    }
  });

  // Add resize functionality
  resizeHandle.addEventListener('mousedown', startResize);

  document.body.appendChild(sidebarIframe);
  document.body.appendChild(resizeHandle);
}

function startResize(e) {
  if (!isOpen) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  isResizing = true;
  
  // Create overlay to capture all mouse events (prevents iframe from blocking)
  const overlay = document.createElement('div');
  overlay.id = 'resize-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483649;
    cursor: ew-resize;
    user-select: none;
  `;
  document.body.appendChild(overlay);
  
  resizeHandle.style.background = 'rgba(99, 102, 241, 0.5)';
  resizeHandle.style.borderLeft = '2px solid rgba(99, 102, 241, 0.8)';
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  
  // Disable ALL transitions during resize
  const originalIframeTransition = sidebarIframe.style.transition;
  const originalHandleTransition = resizeHandle.style.transition;
  const originalBodyTransition = document.body.style.transition;
  
  sidebarIframe.style.transition = 'none';
  resizeHandle.style.transition = 'none';
  document.body.style.transition = 'none';
  
  const onMouseMove = (moveEvent) => {
    if (!isResizing) return;
    
    // Direct calculation: distance from right edge of window
    const distanceFromRight = window.innerWidth - moveEvent.clientX;
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, distanceFromRight));
    
    currentWidth = newWidth;
    
    // Update all elements
    sidebarIframe.style.width = `${newWidth}px`;
    resizeHandle.style.right = `${newWidth}px`;
    document.body.style.marginRight = `${newWidth}px`;
  };
  
  const onMouseUp = () => {
    if (!isResizing) return;
    
    isResizing = false;
    
    // Remove overlay
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    
    resizeHandle.style.background = 'transparent';
    resizeHandle.style.borderLeft = 'none';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Restore transitions
    sidebarIframe.style.transition = originalIframeTransition;
    resizeHandle.style.transition = originalHandleTransition;
    document.body.style.transition = originalBodyTransition;
    
    // Save final width
    localStorage.setItem('sidebarWidth', currentWidth.toString());
    
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

export function toggleSidebar() {
  if (!sidebarIframe) {
    createSidebar();
  }

  isOpen = !isOpen;

  if (isOpen) {
    // Slide in sidebar
    sidebarIframe.style.transform = 'translateX(0)';
    resizeHandle.style.transform = 'translateX(0)';
    // Push main content to the left
    document.body.style.marginRight = `${currentWidth}px`;
    document.body.style.transition = 'margin-right 0.3s ease-in-out';
  } else {
    // Slide out sidebar
    sidebarIframe.style.transform = 'translateX(100%)';
    resizeHandle.style.transform = 'translateX(100%)';
    // Reset main content position
    document.body.style.marginRight = '0';
  }
}

export function getSidebarIframe() {
  return sidebarIframe;
}
