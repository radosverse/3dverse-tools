// Create status message with optional progress bar
const showStatus = (message, duration = 3000, options = {}) => {
  const statusEl = document.getElementById('status-message');

  // Build status content
  let html = `<span class="status-text">${message}</span>`;

  // Add progress bar if percent provided
  if (options.percent !== undefined) {
    html += `
      <div class="status-progress-container">
        <div class="status-progress-bar" style="width: ${options.percent}%"></div>
      </div>
      <span class="status-percent">${options.percent}%</span>
    `;
  }

  // Add current file info if provided
  if (options.currentFile) {
    html += `<div class="status-file">Current: ${options.currentFile}</div>`;
  }

  // Add phase info if provided
  if (options.phase && options.totalPhases) {
    html += `<div class="status-phase">Phase ${options.phase}/${options.totalPhases}</div>`;
  }

  statusEl.innerHTML = html;
  statusEl.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, duration);
  }
};

// Show error status with special styling
const showError = (message, details = null) => {
  const statusEl = document.getElementById('status-message');
  statusEl.classList.add('error');

  let html = `<span class="status-text">${message}</span>`;
  if (details) {
    html += `<div class="status-details">${details}</div>`;
  }

  statusEl.innerHTML = html;
  statusEl.style.display = 'block';

  setTimeout(() => {
    statusEl.style.display = 'none';
    statusEl.classList.remove('error');
  }, 5000);
};

// Show warning status
const showWarning = (message) => {
  const statusEl = document.getElementById('status-message');
  statusEl.classList.add('warning');
  statusEl.innerHTML = `<span class="status-text">${message}</span>`;
  statusEl.style.display = 'block';

  setTimeout(() => {
    statusEl.style.display = 'none';
    statusEl.classList.remove('warning');
  }, 4000);
};

// MODIFIED to support multiple open trees at once
function populateModuleList() {
  moduleList.innerHTML = '';

  // Sort modules by name
  const sortedModules = Object.keys(graphData.modules).sort();

  sortedModules.forEach(moduleName => {
    const moduleItem = document.createElement('li');
    moduleItem.className = 'module-item';
    moduleItem.dataset.module = moduleName;

    const toggle = document.createElement('span');
    toggle.className = 'module-toggle';
    toggle.textContent = '► ';
    moduleItem.appendChild(toggle);

    const moduleNameSpan = document.createElement('span');
    moduleNameSpan.textContent = moduleName;
    moduleItem.appendChild(moduleNameSpan);

    moduleList.appendChild(moduleItem);

    // Create function list
    const functionList = document.createElement('ul');
    functionList.className = 'function-list';

    // Sort functions by name
    const moduleData = graphData.modules[moduleName];
    const functionNames = Array.isArray(moduleData) ? moduleData : [];
    const sortedFunctions = [...functionNames].sort();

    sortedFunctions.forEach(funcName => {
      const functionInfo = graphData.functions[funcName];
      if (!functionInfo) return;

      // Skip private functions if they're not being shown
      if (!showPrivate.checked && !functionInfo.is_public) {
        return;
      }

      const functionItem = document.createElement('li');
      functionItem.className = 'function-item';
      functionItem.classList.add(functionInfo.is_public ? 'public' : 'private');
      functionItem.textContent = funcName;
      functionItem.dataset.function = funcName;

      functionList.appendChild(functionItem);

      // Add click event
      functionItem.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFunction(funcName);
      });
    });

    moduleList.appendChild(functionList);

    // Toggle module expansion - MODIFIED to replace module node with functions graph
    moduleItem.addEventListener('click', (e) => {
      const isExpanded = functionList.style.display === 'block';

      // Toggle only this module's expansion without affecting others
      if (isExpanded) {
        functionList.style.display = 'none';
        toggle.textContent = '► ';
        // Restore original graph view
        buildGraphData();
      } else {
        functionList.style.display = 'block';
        toggle.textContent = '▼ ';
        // Replace module node with detailed function graph
        expandModuleInGraph(moduleName);
      }
    });
  });
}

// MODIFIED to support multiple open trees at once
function populateFunctionModuleList() {
  functionModuleList.innerHTML = '';

  // Skip if function_modules is not available
  if (!graphData.function_modules || Object.keys(graphData.function_modules).length === 0) {
    const noDataItem = document.createElement('li');
    noDataItem.textContent = 'No function module data available';
    functionModuleList.appendChild(noDataItem);
    console.log("No function module data available for sidebar");
    return;
  }

  console.log("Populating function module sidebar with", Object.keys(graphData.function_modules).length, "modules");

  // Sort function modules by name
  const sortedFunctionModules = Object.keys(graphData.function_modules).sort();

  sortedFunctionModules.forEach(functionModuleName => {
    // Skip 'undefined' function module
    if (functionModuleName === 'undefined' || functionModuleName === 'unknown') return;

    const moduleItem = document.createElement('li');
    moduleItem.className = 'module-item';
    moduleItem.dataset.functionModule = functionModuleName;

    const toggle = document.createElement('span');
    toggle.className = 'module-toggle';
    toggle.textContent = '► ';
    moduleItem.appendChild(toggle);

    const moduleNameSpan = document.createElement('span');
    moduleNameSpan.textContent = functionModuleName;
    moduleItem.appendChild(moduleNameSpan);

    functionModuleList.appendChild(moduleItem);

    // Create function list
    const functionList = document.createElement('ul');
    functionList.className = 'function-list';

    // Sort functions by name
    const moduleData = graphData.function_modules[functionModuleName];
    const functionNames = Array.isArray(moduleData) ? moduleData : [];
    const sortedFunctions = [...functionNames].sort();

    sortedFunctions.forEach(funcName => {
      const functionInfo = graphData.functions[funcName];
      if (!functionInfo) return;

      // Skip private functions if they're not being shown
      if (!showPrivate.checked && !functionInfo.is_public) {
        return;
      }

      const functionItem = document.createElement('li');
      functionItem.className = 'function-item';
      functionItem.classList.add(functionInfo.is_public ? 'public' : 'private');
      functionItem.textContent = funcName;
      functionItem.dataset.function = funcName;

      functionList.appendChild(functionItem);

      // Add click event
      functionItem.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFunction(funcName);
      });
    });

    if (functionList.children.length > 0) {
      functionModuleList.appendChild(functionList);

      // Toggle module expansion - MODIFIED to replace function module node with functions graph
      moduleItem.addEventListener('click', (e) => {
        const isExpanded = functionList.style.display === 'block';

        // Toggle only this function module's expansion without affecting others
        if (isExpanded) {
          functionList.style.display = 'none';
          toggle.textContent = '► ';
          // Restore original graph view
          buildGraphData();
        } else {
          functionList.style.display = 'block';
          toggle.textContent = '▼ ';
          // Replace function module node with detailed function graph
          expandFunctionModuleInGraph(functionModuleName);
        }
      });
    }
  });
}

// TODO THIS NEEDS A SIMPLE FNCTION POPULATIG THIS CODE IS PASTED DOING SOMETHING ELSE
function populateFunctionsList() {
  functionsList.innerHTML = '';

  // Get all functions
  const allFunctions = Object.keys(graphData.functions).sort();

  // Filter based on show private setting
  const filteredFunctions = allFunctions.filter(funcName => {
    const funcInfo = graphData.functions[funcName];
    return showPrivate.checked || funcInfo.is_public;
  });

  // Create and add function items
  filteredFunctions.forEach(funcName => {
    const funcInfo = graphData.functions[funcName];

    const functionItem = document.createElement('li');
    functionItem.className = 'function-item';
    functionItem.classList.add(funcInfo.is_public ? 'public' : 'private');
    functionItem.textContent = funcName;
    functionItem.dataset.function = funcName;

    functionItem.addEventListener('click', () => {
      selectFunction(funcName);
    });

    functionsList.appendChild(functionItem);
  });
}


function selectFunction(funcName) {
  // Clear previous selection
  document.querySelectorAll('.function-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Escape special characters for CSS selector
  const escapedFuncName = CSS.escape(funcName);

  // Highlight the selected function
  const functionEl = document.querySelector(`.function-item[data-function="${escapedFuncName}"]`);
  if (functionEl) {
    functionEl.classList.add('selected');
  }

  // Find the function node in the graph
  const node = nodes.find(n => n.id === funcName && n.type === 'function');
  if (node) {
    highlightConnections(node);

    // Center on the node using the stored zoom handler
    if (zoomHandler) {
      const transform = d3.zoomIdentity
        .translate(svgWidth / 2, svgHeight / 2)
        .scale(1)
        .translate(-node.x, -node.y);


    }
  }
}

// Legacy selectModule function - kept but updated to use expandModuleInGraph
function selectModule(moduleName) {
  // Just use the new expand function
  expandModuleInGraph(moduleName);
}

// Legacy selectFunctionModule function - kept but updated to use expandFunctionModuleInGraph
function selectFunctionModule(functionModuleName) {
  // Just use the new expand function
  expandFunctionModuleInGraph(functionModuleName);
}

// Legacy selectSubmodule function - kept but updated to use expandSubmoduleInGraph
function selectSubmodule(submoduleName) {
  // Just use the new expand function
  expandSubmoduleInGraph(submoduleName);
}

// Modified to not switch tabs, but to find and expand the function in the current active view
function selectFunctionInSidebar(funcName) {
  const functionInfo = graphData.functions[funcName];
  if (!functionInfo) return;

  // Check which tab is currently active
  const activeTab = document.querySelector('.tab-content.active');
  const activeTabId = activeTab ? activeTab.id : null;

  // Clear any previous selection
  document.querySelectorAll('.function-item.selected').forEach(item => {
    item.classList.remove('selected');
  });

  let functionFound = false;

  if (activeTabId === 'module-tab') {
    // Find in module view
    const moduleItems = document.querySelectorAll('#module-list .module-item[data-module]');
    for (const item of moduleItems) {
      if (item.dataset.module === functionInfo.module) {
        // Expand the module if not already expanded
        const functionList = item.nextElementSibling;
        const isExpanded = functionList && functionList.style.display === 'block';

        if (!isExpanded) {
          const toggle = item.querySelector('.module-toggle');
          if (toggle) toggle.textContent = '▼ ';
          if (functionList) functionList.style.display = 'block';
        }

        // Find and select the function
        if (functionList) {
          const functionItem = functionList.querySelector(`.function-item[data-function="${CSS.escape(funcName)}"]`);
          if (functionItem) {
            functionItem.classList.add('selected');
            functionFound = true;

            // Also expand the module in the graph
            expandModuleInGraph(functionInfo.module);

            // Break out of the loop once found
            break;
          }
        }
      }
    }
  } else if (activeTabId === 'func-module-tab' && functionInfo.function_module &&
            functionInfo.function_module !== 'undefined' &&
            functionInfo.function_module !== 'unknown') {
    // Find in function module view
    const moduleItems = document.querySelectorAll('#function-module-list .module-item[data-function-module]');
    for (const item of moduleItems) {
      if (item.dataset.functionModule === functionInfo.function_module) {
        // Expand the function module if not already expanded
        const functionList = item.nextElementSibling;
        const isExpanded = functionList && functionList.style.display === 'block';

        if (!isExpanded) {
          const toggle = item.querySelector('.module-toggle');
          if (toggle) toggle.textContent = '▼ ';
          if (functionList) functionList.style.display = 'block';
        }

        // Find and select the function
        if (functionList) {
          const functionItem = functionList.querySelector(`.function-item[data-function="${CSS.escape(funcName)}"]`);
          if (functionItem) {
            functionItem.classList.add('selected');
            functionFound = true;

            // Also expand the function module in the graph
            expandFunctionModuleInGraph(functionInfo.function_module);

            // Break out of the loop once found
            break;
          }
        }
      }
    }
  } else if (activeTabId === 'submodule-tab' && functionInfo.module) {
    // Find the submodule containing this function's module
    for (const [submoduleName, modules] of Object.entries(graphData.submodules)) {
      if (modules.includes(functionInfo.module)) {
        // Find the submodule item
        const submoduleItems = document.querySelectorAll('#submodule-list .module-item[data-submodule]');
        for (const item of submoduleItems) {
          if (item.dataset.submodule === submoduleName) {
            // Expand the submodule if not already expanded
            const modulesList = item.nextElementSibling;
            const isExpanded = modulesList && modulesList.style.display === 'block';

            if (!isExpanded) {
              const toggle = item.querySelector('.module-toggle');
              if (toggle) toggle.textContent = '▼ ';
              if (modulesList) modulesList.style.display = 'block';
            }

            // Find and highlight the module
            if (modulesList) {
              const moduleItem = modulesList.querySelector(`.function-item[data-module="${CSS.escape(functionInfo.module)}"]`);
              if (moduleItem) {
                moduleItem.classList.add('selected');
                functionFound = true;

                // Also expand the submodule in the graph
                expandSubmoduleInGraph(submoduleName);

                // Break out of the loop once found
                break;
              }
            }
          }
        }
        if (functionFound) break;
      }
    }
  }

  // If function wasn't found in the current view, we leave it as is (don't switch tabs)
  // Just highlight it in the graph
  const node = nodes.find(n => n.id === funcName && n.type === 'function');
  if (node) {
    highlightConnections(node);
  }
}

function selectModuleInSidebar(moduleName) {
  // Switch to module tab
  document.querySelector('.tab[data-tab="module-tab"]').click();

  const moduleItems = document.querySelectorAll('#module-list .module-item');
  for (const item of moduleItems) {
    if (item.dataset.module === moduleName) {
      item.click();
      break;
    }
  }
}

function selectFunctionModuleInSidebar(functionModuleName) {
  // Switch to function module tab
  document.querySelector('.tab[data-tab="func-module-tab"]').click();

  const moduleItems = document.querySelectorAll('#function-module-list .module-item');
  for (const item of moduleItems) {
    if (item.dataset.functionModule === functionModuleName) {
      item.click();
      break;
    }
  }
}

function selectSubmoduleInSidebar(submoduleName) {
  // Switch to submodule tab
  document.querySelector('.tab[data-tab="submodule-tab"]').click();

  const submoduleItems = document.querySelectorAll('#submodule-list .module-item');
  for (const item of submoduleItems) {
    if (item.dataset.submodule === submoduleName) {
      item.click();
      break;
    }
  }
}

// Search functionality
function setupSearch() {
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();

    if (searchTerm.length < 2) {
      // Reset the view if search is cleared
      document.querySelectorAll('.module-item, .function-item').forEach(item => {
        item.style.display = 'block';
      });
      return;
    }

    // Search through all functions
    let hasMatches = false;

    // Hide all modules first
    document.querySelectorAll('.module-item').forEach(item => {
      item.style.display = 'none';
    });

    // Search in the active tab
    const activeTab = document.querySelector('.tab-content.active');
    const tabId = activeTab.id;

    if (tabId === 'module-tab') {
      // Show matching functions and their parent modules
      document.querySelectorAll('#module-tab .function-item').forEach(item => {
        const funcName = item.dataset.function ? item.dataset.function.toLowerCase() : '';
        const matches = funcName.includes(searchTerm);

        item.style.display = matches ? 'block' : 'none';

        if (matches) {
          hasMatches = true;

          // Show parent module
          const parentList = item.parentNode;
          parentList.style.display = 'block';

          // Show parent module item
          const moduleItem = parentList.previousElementSibling;
          if (moduleItem && moduleItem.classList.contains('module-item')) {
            moduleItem.style.display = 'block';
          }
        }
      });

      // If no functions match, try matching module names
      if (!hasMatches) {
        document.querySelectorAll('#module-tab .module-item').forEach(item => {
          const moduleName = item.textContent.toLowerCase();
          if (moduleName.includes(searchTerm)) {
            item.style.display = 'block';
            hasMatches = true;
          }
        });
      }
    } else if (tabId === 'func-module-tab') {
      // Show matching functions and their parent function modules
      document.querySelectorAll('#func-module-tab .function-item').forEach(item => {
        const funcName = item.dataset.function ? item.dataset.function.toLowerCase() : '';
        const matches = funcName.includes(searchTerm);

        item.style.display = matches ? 'block' : 'none';

        if (matches) {
          hasMatches = true;

          // Show parent list
          const parentList = item.parentNode;
          parentList.style.display = 'block';

          // Show parent function module
          const parent = parentList.previousElementSibling;
          if (parent && parent.classList.contains('module-item')) {
            parent.style.display = 'block';
          }
        }
      });

      // If no functions match, try matching function module names
      if (!hasMatches) {
        document.querySelectorAll('#func-module-tab .module-item').forEach(item => {
          const moduleName = item.textContent.toLowerCase();
          if (moduleName.includes(searchTerm)) {
            item.style.display = 'block';
            hasMatches = true;
          }
        });
      }
    } else if (tabId === 'submodule-tab') {
      // Show matching modules and their parent submodules
      document.querySelectorAll('#submodule-tab .function-item').forEach(item => {
        const moduleName = item.textContent.toLowerCase();
        const matches = moduleName.includes(searchTerm);

        item.style.display = matches ? 'block' : 'none';

        if (matches) {
          hasMatches = true;

          // Show parent list
          const parentList = item.parentNode;
          parentList.style.display = 'block';

          // Show parent submodule
          const parent = parentList.previousElementSibling;
          if (parent && parent.classList.contains('module-item')) {
            parent.style.display = 'block';

            // Also show parent module header if exists
            const parentHeader = parent.previousElementSibling;
            if (parentHeader && parentHeader.classList.contains('parent-module')) {
              parentHeader.style.display = 'block';
            }
          }
        }
      });

      // If no modules match, try matching submodule names
      if (!hasMatches) {
        document.querySelectorAll('#submodule-tab .module-item').forEach(item => {
          const submoduleName = item.textContent.toLowerCase();
          if (submoduleName.includes(searchTerm)) {
            item.style.display = 'block';
            hasMatches = true;

            // Also show parent module header if exists
            const parentHeader = item.previousElementSibling;
            if (parentHeader && parentHeader.classList.contains('parent-module')) {
              parentHeader.style.display = 'block';
            }
          }
        });
      }
    }
  });
}

// Setup tab handling
function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', (event) => {
      // Check if we're in dual-view mode by checking for Ctrl/Cmd key
      const isDualView = event.ctrlKey || event.metaKey;

      if (!isDualView) {
        // Single tab mode - remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => {
          c.classList.remove('active');
          c.classList.remove('visible');
        });

        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        const tabContent = document.getElementById(tabId);
        tabContent.classList.add('active');
      } else {
        // Dual view mode - toggle the clicked tab and its content
        tab.classList.toggle('active');
        const tabId = tab.getAttribute('data-tab');
        const tabContent = document.getElementById(tabId);

        if (tabContent.classList.contains('active') || tabContent.classList.contains('visible')) {
          tabContent.classList.remove('active');
          tabContent.classList.remove('visible');
        } else {
          tabContent.classList.add('visible');
        }

        // Ensure at least one tab is active
        const activeTabsCount = document.querySelectorAll('.tab.active').length;
        if (activeTabsCount === 0) {
          tab.classList.add('active');
          tabContent.classList.add('active');
        }
      }

      // Synchronize view mode with selected tab
      const tabToViewMap = {
        'module-tab': 'modules',
        'func-module-tab': 'function_modules',
        'functions-tab': 'functions'
      };

      if (tabToViewMap[tab.getAttribute('data-tab')]) {
        viewMode.value = tabToViewMap[tab.getAttribute('data-tab')];
        // Rebuild the graph with new view mode
        buildGraphData();
      }
    });
  });
}

// Export graph as SVG
function setupExport() {
  exportBtn.addEventListener('click', () => {
    showStatus('Exporting SVG...');

    // Clone the SVG
    const svgClone = document.querySelector('svg').cloneNode(true);

    // Set the width and height
    svgClone.setAttribute('width', svgWidth);
    svgClone.setAttribute('height', svgHeight);

    // Add inline styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .node circle {
        fill: #69b3a2;
        stroke: #fff;
        stroke-width: 1.5px;
      }

      .node text {
        font-size: 10px;
        fill: #333;
      }

      .link {
        fill: none;
        stroke: #ccc;
        stroke-width: 1.5px;
      }
    `;
    svgClone.appendChild(styleSheet);

    // Serialize the SVG
    const serializer = new XMLSerializer();
    let svgData = serializer.serializeToString(svgClone);

    // Add XML declaration
    svgData = '<?xml version="1.0" standalone="no"?>\r\n' + svgData;

    // Convert to a blob
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'shader_dependency_graph.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    showStatus('SVG exported successfully!');
  });
}