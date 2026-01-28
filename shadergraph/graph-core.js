/**
 * graph-core.js
 * Handles core data processing, simulation, and data structures
 */

// Graph state
let selectedFunction = null;
let svgWidth, svgHeight;
let simulation;
let nodes = [];
let links = [];
let currentZoomTransform = d3.zoomIdentity;
let zoomHandler;

// Link style toggle - referenced by both files
//let useClassicLinks = true; // Classic is default, toggle switches to enhanced

/**
 * Initialize the graph and core simulation
 */
function initializeGraph() {
    svgWidth = document.querySelector('.graph-container').clientWidth;
    svgHeight = document.querySelector('.graph-container').clientHeight;

    // Set SVG dimensions
    svg
      .attr('width', svgWidth)
      .attr('height', svgHeight);

    // Clear any previous content
    svg.selectAll('*').remove();

    // Create the graph container
    const g = svg.append('g')
      .attr('class', 'graph');

    // Create zoom behavior
    zoomHandler = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        // Store current transform each time it changes
        currentZoomTransform = event.transform;
      });

    // Apply zoom to SVG
    svg.call(zoomHandler);

    // Build graph data
    buildGraphData();
}

/**
 * Build data for graph visualization
 */
function buildGraphData() {
  showStatus('Building graph...', 2000);
  console.log("Current view mode:", viewMode.value);
  console.log("Show private functions:", showPrivate.checked);

  // Reset nodes and links
  nodes = [];
  links = [];

  const view = viewMode.value;
  const showPrivateFunctions = showPrivate.checked;

  if (view === 'modules') {
    // Create module nodes
    Object.keys(graphData.modules).forEach(moduleName => {
      const moduleData = graphData.modules[moduleName];
      const functionList = Array.isArray(moduleData) ? moduleData : [];

      nodes.push({
        id: moduleName,
        type: 'module',
        functions: functionList
      });
    });

    // Create links between modules
    Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
      if (!graphData.functions[funcName]) return;

      const sourceModule = graphData.functions[funcName].module;
      if (!sourceModule) return;

      const depList = Array.isArray(dependencies) ? dependencies : [];

      depList.forEach(targetFunc => {
        if (!graphData.functions[targetFunc]) return;

        const targetModule = graphData.functions[targetFunc].module;
        if (!targetModule || sourceModule === targetModule) return;

        // Check if link already exists
        const existingLink = links.find(l =>
          (l.source === sourceModule && l.target === targetModule) ||
          (l.source.id === sourceModule && l.target.id === targetModule)
        );

        if (!existingLink) {
          links.push({
            source: sourceModule,
            target: targetModule,
            value: 1
          });
        }
      });
    });
  } else if (view === 'function_modules') {
    console.log("Building function_modules view");

    // Create function module nodes
    Object.keys(graphData.function_modules).forEach(functionModuleName => {
      if (functionModuleName === 'undefined' || functionModuleName === 'unknown') {
        console.log(`Skipping '${functionModuleName}' function module`);
        return;
      }

      const functionList = graphData.function_modules[functionModuleName];
      console.log(`Function module ${functionModuleName} has ${Array.isArray(functionList) ? functionList.length : 0} functions`);

      if (!Array.isArray(functionList) || functionList.length === 0) {
        console.log(`Function list for ${functionModuleName} is not an array or empty`);
        return;
      }

      const visibleFunctions = functionList.filter(funcName =>
        showPrivateFunctions || (graphData.functions[funcName] && graphData.functions[funcName].is_public)
      );

      console.log(`Function module ${functionModuleName} has ${visibleFunctions.length} visible functions`);

      if (visibleFunctions.length === 0) {
        console.log(`Skipping ${functionModuleName} - no visible functions`);
        return;
      }

      nodes.push({
        id: functionModuleName,
        type: 'function_module',
        functions: visibleFunctions
      });
      console.log(`Added function module node: ${functionModuleName}`);
    });

    // Create links between function modules
    Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
      if (!graphData.functions[funcName]) return;
      if (!showPrivateFunctions && !graphData.functions[funcName].is_public) return;

      const sourceFunctionModule = graphData.functions[funcName].function_module;
      if (!sourceFunctionModule ||
          sourceFunctionModule === 'undefined' ||
          sourceFunctionModule === 'unknown') return;

      const depList = Array.isArray(dependencies) ? dependencies : [];

      depList.forEach(targetFunc => {
        if (!graphData.functions[targetFunc]) return;
        if (!showPrivateFunctions && !graphData.functions[targetFunc].is_public) return;

        const targetFunctionModule = graphData.functions[targetFunc].function_module;
        if (!targetFunctionModule ||
            targetFunctionModule === 'undefined' ||
            targetFunctionModule === 'unknown' ||
            sourceFunctionModule === targetFunctionModule) return;

        // Check if function modules exist in our nodes
        const sourceNode = nodes.find(n => n.id === sourceFunctionModule);
        const targetNode = nodes.find(n => n.id === targetFunctionModule);

        if (!sourceNode || !targetNode) return;

        // Check if link already exists
        const existingLink = links.find(l =>
          (l.source === sourceFunctionModule && l.target === targetFunctionModule) ||
          (l.source.id === sourceFunctionModule && l.target.id === targetFunctionModule)
        );

        if (!existingLink) {
          links.push({
            source: sourceFunctionModule,
            target: targetFunctionModule,
            value: 1
          });
        }
      });
    });
  } else {
    // Show all functions (default view)
    console.log("Building functions view (default)");
    let functionCount = 0;
    let publicCount = 0;
    let privateCount = 0;

    Object.entries(graphData.functions).forEach(([funcName, funcInfo]) => {
      functionCount++;
      if (funcInfo.is_public) {
        publicCount++;
      } else {
        privateCount++;
      }

      if (showPrivateFunctions || funcInfo.is_public) {
        nodes.push({
          id: funcName,
          type: 'function',
          module: funcInfo.module,
          submodule: funcInfo.submodule,
          function_module: funcInfo.function_module,
          isPublic: funcInfo.is_public
        });
      }
    });

    console.log(`Total functions: ${functionCount}, Public: ${publicCount}, Private: ${privateCount}, Added to view: ${nodes.length}`);

    // Create links between functions
    Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
      if (
        graphData.functions[funcName] &&
        (showPrivateFunctions || graphData.functions[funcName].is_public)
      ) {
        const depList = Array.isArray(dependencies) ? dependencies : [];

        depList.forEach(targetFunc => {
          if (
            graphData.functions[targetFunc] &&
            (showPrivateFunctions || graphData.functions[targetFunc].is_public)
          ) {
            links.push({
              source: funcName,
              target: targetFunc,
              value: 1
            });
          }
        });
      }
    });
  }

  console.log(`Created graph with ${nodes.length} nodes and ${links.length} links with view mode: ${view}`);
  showStatus(`Created graph with ${nodes.length} nodes and ${links.length} links`);

  if (nodes.length === 0) {
    showStatus(`No nodes to display with view mode: ${view}. Check console for details.`, 5000);
  }

  // Call the renderer
  renderGraph();
}

/**
 * Helper function to center on a set of nodes
 */
function centerOnNodes(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return;

  // Calculate the centroid
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  nodes.forEach(node => {
    if (nodeIds.includes(node.id) && node.x !== undefined && node.y !== undefined) {
      sumX += node.x;
      sumY += node.y;
      count++;
    }
  });

  if (count > 0) {
    const centerX = sumX / count;
    const centerY = sumY / count;

    // Center the view
    const transform = d3.zoomIdentity
      .translate(svgWidth / 2, svgHeight / 2)
      .scale(1)
      .translate(-centerX, -centerY);

    if (zoomHandler) {
      svg.call(zoomHandler.transform, transform);
      currentZoomTransform = transform;
    }
  }
}

/**
 * Expand a module in the graph
 */
function expandModuleInGraph(moduleName) {
  // Clear previous selection
  document.querySelectorAll('.module-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Highlight the module in the sidebar
  const moduleItems = document.querySelectorAll('.module-item[data-module]');
  for (const item of moduleItems) {
    if (item.dataset.module === moduleName) {
      item.classList.add('selected');
      // Update toggle visual
      const toggle = item.querySelector('.module-toggle');
      if (toggle) {
        toggle.textContent = '▼ ';
      }
      // Show function list
      const nextElement = item.nextElementSibling;
      if (nextElement && nextElement.classList.contains('function-list')) {
        nextElement.style.display = 'block';
      }
      break;
    }
  }

  // First get current visible nodes to preserve context
  const currentNodesMap = new Map();
  const currentLinksMap = new Map();
  const moduleMappings = new Map();

  // Store current nodes and links for reference
  nodes.forEach(node => {
    currentNodesMap.set(node.id, node);
    if (node.type === 'module') {
      moduleMappings.set(node.id, []);
    }
  });

  links.forEach(link => {
    const linkId = typeof link.source === 'object'
      ? `${link.source.id}->${link.target.id}`
      : `${link.source}->${link.target}`;
    currentLinksMap.set(linkId, link);
  });

  // Find and remove the module node we're expanding
  const expandedNode = currentNodesMap.get(moduleName);
  if (expandedNode) {
    currentNodesMap.delete(moduleName);
  }

  // Create new lists for nodes and links
  const newNodes = [];
  const newLinks = [];

  // Add all non-expanded nodes
  currentNodesMap.forEach(node => {
    newNodes.push(node);
  });

  // Add the functions of the expanded module
  const moduleFunctions = graphData.modules[moduleName] || [];
  const showPrivateFunctions = showPrivate.checked;
  const expandedFunctions = [];

  moduleFunctions.forEach(funcName => {
    const funcInfo = graphData.functions[funcName];
    if (!funcInfo) return;

    // Skip private functions if not shown
    if (!showPrivateFunctions && !funcInfo.is_public) {
      return;
    }

    expandedFunctions.push(funcName);

    newNodes.push({
      id: funcName,
      type: 'function',
      module: funcInfo.module,
      function_module: funcInfo.function_module,
      submodule: funcInfo.submodule,
      isPublic: funcInfo.is_public,
      isExpanded: true // Mark as expanded for special visual treatment
    });
  });

  // Add links between expanded functions
  Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
    if (!expandedFunctions.includes(funcName)) return;

    const depList = Array.isArray(dependencies) ? dependencies : [];

    depList.forEach(targetFunc => {
      if (!expandedFunctions.includes(targetFunc)) return;

      newLinks.push({
        source: funcName,
        target: targetFunc,
        value: 1,
        isExpanded: true
      });
    });
  });

  // Add links between expanded functions and other nodes
  Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
    const isSource = expandedFunctions.includes(funcName);
    if (!isSource && !expandedFunctions.some(f => dependencies.includes(f))) {
      return; // Skip if neither source nor target is in our expanded functions
    }

    const depList = Array.isArray(dependencies) ? dependencies : [];

    if (isSource) {
      // This function is in our expanded set looking outward
      depList.forEach(targetFunc => {
        if (expandedFunctions.includes(targetFunc)) return; // Skip internal links already added

        // Only add links to visible nodes
        if (currentNodesMap.has(targetFunc) ||
            (currentNodesMap.has(graphData.functions[targetFunc]?.module))) {

          let targetId = targetFunc;

          // If the target function isn't directly in the graph, link to its module
          if (!currentNodesMap.has(targetFunc) &&
              graphData.functions[targetFunc]?.module &&
              currentNodesMap.has(graphData.functions[targetFunc].module)) {
            targetId = graphData.functions[targetFunc].module;
          }

          newLinks.push({
            source: funcName,
            target: targetId,
            value: 1,
            isExpanded: true
          });
        }
      });
    } else {
      // This function is outside looking into our expanded functions
      depList.forEach(targetFunc => {
        if (!expandedFunctions.includes(targetFunc)) return;

        if (currentNodesMap.has(funcName)) {
          newLinks.push({
            source: funcName,
            target: targetFunc,
            value: 1,
            isExpanded: true
          });
        } else if (graphData.functions[funcName]?.module &&
                   currentNodesMap.has(graphData.functions[funcName].module)) {
          // Link from the module to our expanded function
          newLinks.push({
            source: graphData.functions[funcName].module,
            target: targetFunc,
            value: 1,
            isExpanded: true
          });
        }
      });
    }
  });

  // Replace old nodes and links with new expanded ones
  nodes = newNodes;
  links = newLinks;

  // Render the updated graph
  renderGraph();

  // Focus the view on the expanded area
  centerOnNodes(expandedFunctions);
}

/**
 * Expand a function module in the graph
 */
function expandFunctionModuleInGraph(functionModuleName) {
  // Clear previous selection
  document.querySelectorAll('.module-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Highlight the function module in the sidebar
  const moduleItems = document.querySelectorAll('.module-item[data-function-module]');
  for (const item of moduleItems) {
    if (item.dataset.functionModule === functionModuleName) {
      item.classList.add('selected');
      // Update toggle visual
      const toggle = item.querySelector('.module-toggle');
      if (toggle) {
        toggle.textContent = '▼ ';
      }
      // Show function list
      const nextElement = item.nextElementSibling;
      if (nextElement && nextElement.classList.contains('function-list')) {
        nextElement.style.display = 'block';
      }
      break;
    }
  }

  // First get current visible nodes to preserve context
  const currentNodesMap = new Map();
  const currentLinksMap = new Map();

  // Store current nodes and links for reference
  nodes.forEach(node => {
    currentNodesMap.set(node.id, node);
  });

  links.forEach(link => {
    const linkId = typeof link.source === 'object'
      ? `${link.source.id}->${link.target.id}`
      : `${link.source}->${link.target}`;
    currentLinksMap.set(linkId, link);
  });

  // Find and remove the function module node we're expanding
  const expandedNode = currentNodesMap.get(functionModuleName);
  if (expandedNode) {
    currentNodesMap.delete(functionModuleName);
  }

  // Create new lists for nodes and links
  const newNodes = [];
  const newLinks = [];

  // Add all non-expanded nodes
  currentNodesMap.forEach(node => {
    newNodes.push(node);
  });

  // Add the functions of the expanded function module
  const moduleFunctions = graphData.function_modules[functionModuleName] || [];
  const showPrivateFunctions = showPrivate.checked;
  const expandedFunctions = [];

  moduleFunctions.forEach(funcName => {
    const funcInfo = graphData.functions[funcName];
    if (!funcInfo) return;

    // Skip private functions if not shown
    if (!showPrivateFunctions && !funcInfo.is_public) {
      return;
    }

    expandedFunctions.push(funcName);

    newNodes.push({
      id: funcName,
      type: 'function',
      module: funcInfo.module,
      function_module: funcInfo.function_module,
      submodule: funcInfo.submodule,
      isPublic: funcInfo.is_public,
      isExpanded: true // Mark as expanded for special visual treatment
    });
  });

  // Add links between expanded functions
  Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
    if (!expandedFunctions.includes(funcName)) return;

    const depList = Array.isArray(dependencies) ? dependencies : [];

    depList.forEach(targetFunc => {
      if (!expandedFunctions.includes(targetFunc)) return;

      newLinks.push({
        source: funcName,
        target: targetFunc,
        value: 1,
        isExpanded: true
      });
    });
  });

  // Add links between expanded functions and other nodes
  Object.entries(graphData.dependencies).forEach(([funcName, dependencies]) => {
    const isSource = expandedFunctions.includes(funcName);
    if (!isSource && !expandedFunctions.some(f => dependencies.includes(f))) {
      return; // Skip if neither source nor target is in our expanded functions
    }

    const depList = Array.isArray(dependencies) ? dependencies : [];

    if (isSource) {
      // This function is in our expanded set looking outward
      depList.forEach(targetFunc => {
        if (expandedFunctions.includes(targetFunc)) return; // Skip internal links already added

        // Only add links to visible nodes
        if (currentNodesMap.has(targetFunc) ||
            (currentNodesMap.has(graphData.functions[targetFunc]?.module)) ||
            (currentNodesMap.has(graphData.functions[targetFunc]?.function_module))) {

          let targetId = targetFunc;

          // If the target function isn't directly in the graph, link to its module or function module
          if (!currentNodesMap.has(targetFunc)) {
            if (graphData.functions[targetFunc]?.function_module &&
                currentNodesMap.has(graphData.functions[targetFunc].function_module)) {
              targetId = graphData.functions[targetFunc].function_module;
            } else if (graphData.functions[targetFunc]?.module &&
                       currentNodesMap.has(graphData.functions[targetFunc].module)) {
              targetId = graphData.functions[targetFunc].module;
            } else {
              return; // No valid target node to connect to
            }
          }

          newLinks.push({
            source: funcName,
            target: targetId,
            value: 1,
            isExpanded: true
          });
        }
      });
    } else {
      // This function is outside looking into our expanded functions
      depList.forEach(targetFunc => {
        if (!expandedFunctions.includes(targetFunc)) return;

        if (currentNodesMap.has(funcName)) {
          newLinks.push({
            source: funcName,
            target: targetFunc,
            value: 1,
            isExpanded: true
          });
        } else if (graphData.functions[funcName]?.function_module &&
                   currentNodesMap.has(graphData.functions[funcName].function_module)) {
          // Link from the function module to our expanded function
          newLinks.push({
            source: graphData.functions[funcName].function_module,
            target: targetFunc,
            value: 1,
            isExpanded: true
          });
        } else if (graphData.functions[funcName]?.module &&
                   currentNodesMap.has(graphData.functions[funcName].module)) {
          // Link from the module to our expanded function
          newLinks.push({
            source: graphData.functions[funcName].module,
            target: targetFunc,
            value: 1,
            isExpanded: true
          });
        }
      });
    }
  });

  // Replace old nodes and links with new expanded ones
  nodes = newNodes;
  links = newLinks;

  // Render the updated graph
  renderGraph();

  // Focus the view on the expanded area
  centerOnNodes(expandedFunctions);
}

/**
 * Expand a submodule in the graph
 */
function expandSubmoduleInGraph(submoduleName) {
  // Clear previous selection
  document.querySelectorAll('.module-item.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Highlight the submodule in the sidebar
  const submoduleItems = document.querySelectorAll('.module-item[data-submodule]');
  for (const item of submoduleItems) {
    if (item.dataset.submodule === submoduleName) {
      item.classList.add('selected');
      // Update toggle visual
      const toggle = item.querySelector('.module-toggle');
      if (toggle) {
        toggle.textContent = '▼ ';
      }
      // Show modules list
      const nextElement = item.nextElementSibling;
      if (nextElement && nextElement.classList.contains('function-list')) {
        nextElement.style.display = 'block';
      }
      break;
    }
  }

  // First get current visible nodes to preserve context
  const currentNodesMap = new Map();
  const currentLinksMap = new Map();

  // Store current nodes and links for reference
  nodes.forEach(node => {
    currentNodesMap.set(node.id, node);
  });

  links.forEach(link => {
    const linkId = typeof link.source === 'object'
      ? `${link.source.id}->${link.target.id}`
      : `${link.source}->${link.target}`;
    currentLinksMap.set(linkId, link);
  });

  // Find and remove the submodule node we're expanding
  const expandedNode = currentNodesMap.get(submoduleName);
  if (expandedNode) {
    currentNodesMap.delete(submoduleName);
  }

  // Create new lists for nodes and links
  const newNodes = [];
  const newLinks = [];

  // Add all non-expanded nodes
  currentNodesMap.forEach(node => {
    newNodes.push(node);
  });

  // Get the modules that belong to this submodule
  const submoduleModules = graphData.submodules[submoduleName] || [];
  const expandedModules = [];

  // Add the modules of the expanded submodule
  submoduleModules.forEach(moduleName => {
    expandedModules.push(moduleName);

    newNodes.push({
      id: moduleName,
      type: 'module',
      functions: graphData.modules[moduleName] || [],
      isExpanded: true // Mark as expanded for special visual treatment
    });
  });

  // Add links between expanded modules
  for (let i = 0; i < expandedModules.length; i++) {
    const sourceModule = expandedModules[i];
    const sourceFunctions = graphData.modules[sourceModule] || [];

    for (let j = 0; j < expandedModules.length; j++) {
      if (i === j) continue; // Skip self-links

      const targetModule = expandedModules[j];
      const targetFunctions = graphData.modules[targetModule] || [];

      // Check if there's a dependency between these modules
      let hasDependency = false;

      // Look for dependencies from source to target module
      sourceFunctions.forEach(sourceFunc => {
        const dependencies = graphData.dependencies[sourceFunc] || [];
        if (dependencies.some(depFunc => targetFunctions.includes(depFunc))) {
          hasDependency = true;
        }
      });

      if (hasDependency) {
        newLinks.push({
          source: sourceModule,
          target: targetModule,
          value: 1,
          isExpanded: true
        });
      }
    }
  }

  // Add links between expanded modules and other nodes
  Object.keys(graphData.modules).forEach(moduleName => {
    if (expandedModules.includes(moduleName)) return; // Skip expanded modules
    if (!currentNodesMap.has(moduleName)) return; // Skip modules not in graph

    const moduleFunctions = graphData.modules[moduleName] || [];

    // Check for dependencies from this module to any expanded module
    let hasOutgoingDependency = false;
    let hasIncomingDependency = false;

    expandedModules.forEach(expandedModule => {
      const expandedFunctions = graphData.modules[expandedModule] || [];

      // Check outgoing dependencies
      moduleFunctions.forEach(funcName => {
        const deps = graphData.dependencies[funcName] || [];
        if (deps.some(dep => expandedFunctions.includes(dep))) {
          hasOutgoingDependency = true;

          // Add link from this module to the expanded module
          newLinks.push({
            source: moduleName,
            target: expandedModule,
            value: 1,
            isExpanded: true
          });
        }
      });

      // Check incoming dependencies
      expandedFunctions.forEach(funcName => {
        const deps = graphData.dependencies[funcName] || [];
        if (deps.some(dep => moduleFunctions.includes(dep))) {
          hasIncomingDependency = true;

          // Add link from expanded module to this module
          newLinks.push({
            source: expandedModule,
            target: moduleName,
            value: 1,
            isExpanded: true
          });
        }
      });
    });
  });

  // Replace old nodes and links with new expanded ones
  nodes = newNodes;
  links = newLinks;

  // Render the updated graph
  renderGraph();

  // Focus the view on the expanded area
  centerOnNodes(expandedModules);
}

// Drag behavior functions
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}