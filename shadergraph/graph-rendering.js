/**
 * graph-rendering.js
 * Handles visual rendering, styling, and visual interactions
 */

// Link style - always use classic style
const useClassicLinks = true;

// Node styling functions

/**
 * Get node radius based on node type and state
 */
function getNodeRadius(d) {
  // Base radius for each type
  let baseRadius;
  switch (d.type) {
    case 'module':
      baseRadius = 18; // Larger size for modules
      break;
    case 'function_module':
      baseRadius = 15; // Medium-large for function modules
      break;
    case 'submodule':
      baseRadius = 16; // Medium-large for submodules
      break;
    case 'function':
      baseRadius = 8; // Smaller for functions
      break;
    default:
      baseRadius = 10;
  }

  // Apply modifiers
  if (d.id === selectedFunction) {
    return baseRadius * 1.3; // Selected nodes are larger
  }

  if (d.isExpanded) {
    return baseRadius * 1.2; // Expanded nodes are larger
  }

  // Add slight size variation based on number of connections
  if (d.type === 'module' || d.type === 'function_module' || d.type === 'submodule') {
    const functions = d.functions || [];
    const functionCount = Array.isArray(functions) ? functions.length : 0;
    return baseRadius + Math.min(Math.sqrt(functionCount) * 0.5, 5); // Cap the increase
  }

  // For functions, size based on dependencies
  if (d.type === 'function') {
    const deps = graphData.dependencies[d.id];
    const depCount = deps && Array.isArray(deps) ? deps.length : 0;
    return baseRadius + Math.min(Math.sqrt(depCount) * 0.3, 3); // Cap the increase
  }

  return baseRadius;
}

/**
 * Get node color based on node type and state
 */
function getNodeColor(d) {
  // Special highlight for selected nodes
  if (d.id === selectedFunction) {
    switch (d.type) {
      case 'module':
        return '#0D47A1'; // Very deep blue
      case 'function_module':
        return '#E65100'; // Very deep orange
      case 'submodule':
        return '#6A1B9A'; // Very deep purple
      case 'function':
        return d.isPublic ? '#1B5E20' : '#B71C1C'; // Very deep green/red
      default:
        return '#37474F'; // Very deep grey
    }
  }

  // Special highlight for expanded nodes
  if (d.isExpanded) {
    switch (d.type) {
      case 'module':
        return '#2962FF'; // Deeper blue for expanded modules
      case 'function_module':
        return '#F57C00'; // Deeper orange for expanded function modules
      case 'submodule':
        return '#8E24AA'; // Deeper purple for expanded submodules
      case 'function':
        return d.isPublic ? '#00B248' : '#D32F2F'; // Deeper green/red
      default:
        return '#455A64'; // Deeper grey
    }
  }

  // Regular colors
  switch (d.type) {
    case 'module':
      return '#4285F4'; // Google blue for modules
    case 'function_module':
      return '#FF9800'; // Orange for function modules
    case 'submodule':
      return '#9C27B0'; // Purple for submodules
    case 'function':
      return d.isPublic ? '#00C853' : '#F44336'; // Green for public, red for private
    default:
      return '#607D8B'; // Grey
  }
}

/**
 * Get node stroke color
 */
function getNodeStroke(d) {
  // Based on node type
  switch (d.type) {
    case 'module':
      return '#82B1FF'; // Light blue
    case 'function_module':
      return '#FFD180'; // Light orange
    case 'submodule':
      return '#D1C4E9'; // Light purple
    case 'function':
      return d.isPublic ? '#B9F6CA' : '#FFCDD2'; // Light green/red
    default:
      return '#CFD8DC'; // Light grey
  }
}

/**
 * Calculate marker refX based on target node type to prevent arrow occlusion
 */
function calculateMarkerRefX(d) {
  if (typeof d.target === 'object') {
    // For module-type nodes, increase refX to start arrow earlier
    switch (d.target.type) {
      case 'module':
        return 25; // Much larger offset for modules
      case 'function_module':
      case 'submodule':
        return 22; // Larger offset for medium-sized nodes
      default:
        return 15; // Default for function nodes
    }
  }
  return 15; // Default if target not resolved to object
}

/**
 * Render the graph with D3
 */
function renderGraph() {
    const g = svg.select('.graph');

    // Store current zoom transform before clearing
    if (d3.zoomTransform(svg.node())) {
      currentZoomTransform = d3.zoomTransform(svg.node());
    }

    // Clear previous graph
    g.selectAll('*').remove();

    // Remove existing tooltips
    d3.selectAll('.tooltip').remove();

  // Create tooltip
  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

  if (nodes.length === 0) {
    g.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', svgHeight / 2)
      .attr('text-anchor', 'middle')
      .text('No nodes to display. Adjust filters or check your data.');
    return;
  }

  // Create the simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
    .force('collide', d3.forceCollide(getNodeRadius));

  // Define arrow markers - simplify to just use standard markers
  const markerTypes = ["end", "end-bidirectional"];

  // Add markers with consistent sizing
  g.append("defs").selectAll("marker")
    .data(markerTypes)
    .enter().append("marker")
    .attr("id", d => d)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8) // Use a consistent refX that works with the path adjustment
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", d => {
      if (d === "end-bidirectional") return "#FF6D00"; // Orange for bidirectional
      return useClassicLinks ? "#444" : "#78909C"; // Dark gray for classic, blueish grey for enhanced
    })
    .attr("d", d => {
      if (d === "end-bidirectional") {
        return "M0,-5L10,0L0,5M10,-5L0,0L10,5"; // Double arrowhead
      }
      return "M0,-5L10,0L0,5"; // Single arrowhead
    });

  // Find bidirectional links
  const bidirectionalPairs = new Set();
  links.forEach((link1, i) => {
    const source1 = typeof link1.source === 'object' ? link1.source.id : link1.source;
    const target1 = typeof link1.target === 'object' ? link1.target.id : link1.target;

    links.forEach((link2, j) => {
      if (i !== j) {
        const source2 = typeof link2.source === 'object' ? link2.source.id : link2.source;
        const target2 = typeof link2.target === 'object' ? link2.target.id : link2.target;

        if (source1 === target2 && target1 === source2) {
          // Found a bidirectional link
          const linkKey = [source1, target1].sort().join('->');
          bidirectionalPairs.add(linkKey);
        }
      }
    });
  });

  // Create links with style based on current mode
  const link = g.append('g')
    .attr('class', 'links')
    .selectAll('path')
    .data(links)
    .enter()
    .append('path')
    .attr('class', d => {
      const source = typeof d.source === 'object' ? d.source.id : d.source;
      const target = typeof d.target === 'object' ? d.target.id : d.target;
      const linkKey = [source, target].sort().join('->');

      let classes = 'link';
      if (bidirectionalPairs.has(linkKey)) classes += ' bidirectional';
      if (d.isExpanded) classes += ' expanded';
      if (!useClassicLinks) classes += ' enhanced'; // Add class for enhanced style
      return classes;
    })
    .attr('stroke', d => {
      const source = typeof d.source === 'object' ? d.source.id : d.source;
      const target = typeof d.target === 'object' ? d.target.id : d.target;
      const linkKey = [source, target].sort().join('->');

      // More vibrant colors for links
      if (bidirectionalPairs.has(linkKey)) {
        return "#FF6D00"; // Brighter orange for bidirectional
      }

      // Special colors for expanded node links
      if (d.isExpanded) {
        return "#5D4037"; // Brown for expanded links
      }

      return "#78909C"; // Blueish grey for normal links
    })
    .attr('stroke-width', d => {
      // Thicker lines for important connections
      if (d.isExpanded) {
        return Math.sqrt(d.value) + 1;
      }
      return Math.sqrt(d.value);
    })
    .attr('stroke-opacity', 0.7) // Slightly transparent
    .attr('marker-end', d => {
      const source = typeof d.source === 'object' ? d.source.id : d.source;
      const target = typeof d.target === 'object' ? d.target.id : d.target;
      const linkKey = [source, target].sort().join('->');

      const markerType = bidirectionalPairs.has(linkKey) ? "end-bidirectional" : "end";
      return `url(#${markerType})`;
    });

  // Create nodes
  const node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('.node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', d => {
      let classes = 'node node-' + d.type;
      if (d.type === 'function') {
        classes += d.isPublic ? ' public' : ' private';
      }
      if (d.id === selectedFunction) {
        classes += ' selected';
      }
      return classes;
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Add subtle glow effect for important nodes
  node.filter(d => d.type !== 'function' || d.id === selectedFunction)
    .append('circle')
    .attr('class', 'node-glow')
    .attr('r', d => getNodeRadius(d) + 3)
    .attr('stroke', getNodeStroke)
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.3);

  // Add circles to nodes
  node.append('circle')
    .attr('r', getNodeRadius)
    .attr('fill', getNodeColor)
    .attr('stroke', getNodeStroke)
    .attr('stroke-width', d => {
      if (d.id === selectedFunction) {
        return 3; // Thicker border for selected
      }
      return d.isExpanded ? 2 : 1.5; // Medium for expanded, smaller for normal
    })
    .attr('stroke-opacity', 0.8);

  // Add text labels to nodes
  node.append('text')
    .attr('dx', d => {
      // Position labels based on node size and type
      const radius = getNodeRadius(d);
      return d.type === 'function' ? radius + 5 : 0;
    })
    .attr('dy', d => d.type === 'function' ? '.35em' : '.38em')
    .attr('text-anchor', d => d.type === 'function' ? 'start' : 'middle')
    .text(d => {
      // Show a shortened name for better readability
      const parts = d.id.split('.');
      const lastPart = parts[parts.length - 1];

      return lastPart;
    })
    .style('font-weight', d => {
      // Bold for non-functions and for expanded/selected nodes
      return d.type !== 'function' || d.isExpanded || d.id === selectedFunction ? 'bold' : 'normal';
    })
    .style('font-size', d => {
      // Larger font for module nodes
      if (d.type !== 'function') {
        return '11px';
      }
      // Larger font for expanded nodes
      return d.isExpanded ? '11px' : '10px';
    })
    .style('fill', '#333333') // Darker text for better readability
    .style('text-shadow', d => {
      // Add text shadow for better readability over nodes
      if (d.type !== 'function') {
        return '0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white';
      }
      return 'none';
    });

  // Add tooltips
  node.on('mouseover', function(event, d) {
      // Show tooltip
      tooltip.transition()
        .duration(200)
        .style('opacity', .8);

      let tooltipContent = '';
      if (d.type === 'module') {
        const functionCount = Array.isArray(d.functions) ? d.functions.length : 0;
        tooltipContent = `
          <strong>Module:</strong> ${d.id}<br>
          <strong>Functions:</strong> ${functionCount}
        `;
      } else if (d.type === 'function_module') {
        const functionCount = Array.isArray(d.functions) ? d.functions.length : 0;
        tooltipContent = `
          <strong>Function Module:</strong> ${d.id}<br>
          <strong>Functions:</strong> ${functionCount}
        `;
      } else if (d.type === 'submodule') {
        const moduleCount = Array.isArray(d.modules) ? d.modules.length : 0;
        tooltipContent = `
          <strong>Submodule:</strong> ${d.id}<br>
          <strong>Modules:</strong> ${moduleCount}<br>
          <strong>Functions:</strong> ${d.functionCount || 0}
        `;
      } else {
        const deps = graphData.dependencies[d.id];
        const depCount = deps && Array.isArray(deps) ? deps.length : 0;

        tooltipContent = `
          <strong>Function:</strong> ${d.id}<br>
          <strong>Module:</strong> ${d.module}<br>
          <strong>Type:</strong> ${d.isPublic ? 'Public' : 'Private'}<br>
          <strong>Dependencies:</strong> ${depCount}
        `;

        if (d.function_module && d.function_module !== 'undefined' && d.function_module !== 'unknown') {
          tooltipContent += `<br><strong>Function Module:</strong> ${d.function_module}`;
        }

        if (d.submodule && d.submodule !== d.module) {
          tooltipContent += `<br><strong>Submodule:</strong> ${d.submodule}`;
        }
      }

      tooltip.html(tooltipContent)
        .style('left', (event.pageX + 50) + 'px')
        .style('top', (event.pageY - 75) + 'px');

      // Highlight the node on hover
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', getNodeRadius(d) * 1.1)
        .attr('stroke-width', d.id === selectedFunction ? 3 : 2);

      // Highlight connected nodes
      const connectedNodes = new Set();
      links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        if (sourceId === d.id) {
          connectedNodes.add(targetId);
        } else if (targetId === d.id) {
          connectedNodes.add(sourceId);
        }
      });

      svg.selectAll('.node')
        .filter(n => connectedNodes.has(n.id))
        .select('circle')
        .transition()
        .duration(200)
        .attr('r', n => getNodeRadius(n) * 1.05)
        .attr('stroke-width', n => n.id === selectedFunction ? 3 : 2);

      // Highlight connected links
      svg.selectAll('.link')
        .filter(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return sourceId === d.id || targetId === d.id;
        })
        .transition()
        .duration(200)
        .attr('stroke-width', link => Math.sqrt(link.value) + 1)
        .attr('stroke-opacity', 1);
    })
    .on('mouseout', function(event, d) {
      // Hide tooltip
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);

      // Restore node styling
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', getNodeRadius)
        .attr('stroke-width', d => {
          if (d.id === selectedFunction) {
            return 3;
          }
          return d.isExpanded ? 2 : 1.5;
        });

      // Restore all nodes
      svg.selectAll('.node circle')
        .filter(n => n.id !== selectedFunction)
        .transition()
        .duration(200)
        .attr('r', getNodeRadius)
        .attr('stroke-width', n => n.isExpanded ? 2 : 1.5);

      // Restore all links
      svg.selectAll('.link')
        .transition()
        .duration(200)
        .attr('stroke-width', link => Math.sqrt(link.value))
        .attr('stroke-opacity', 0.7);
    });

  // Handle click events
  node.on('click', function(event, d) {
    event.stopPropagation();
    highlightConnections(d);

    // Update sidebar selection
    if (d.type === 'function') {
      // Here we use just selectFunction directly to match tree view behavior
      selectFunction(d.id);
    } else if (d.type === 'module') {
      selectModuleInSidebar(d.id);
    } else if (d.type === 'function_module') {
      selectFunctionModuleInSidebar(d.id);
    } else if (d.type === 'submodule') {
      selectSubmoduleInSidebar(d.id);
    }
  });

  // Update positions on simulation tick
  simulation.on('tick', () => {
    // Update link paths for directional arrows
    link.attr('d', d => {
      const sourceX = d.source.x;
      const sourceY = d.source.y;
      const targetX = d.target.x;
      const targetY = d.target.y;

      // Calculate path with slight curve for better arrow visibility
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const dr = Math.sqrt(dx * dx + dy * dy);

      // Check if it's a bidirectional link - add more curve
      const source = typeof d.source === 'object' ? d.source.id : d.source;
      const target = typeof d.target === 'object' ? d.target.id : d.target;
      const linkKey = [source, target].sort().join('->');
      const isBidirectional = bidirectionalPairs.has(linkKey);

      // Adjust the curve based on direction and if bidirectional
      const curve = isBidirectional ? dr * 1.2 : dr * 0.7;

      // Calculate the target node type to adjust the connection point
      const targetNode = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === target);

      // Get the target radius
      const targetRadius = targetNode ? getNodeRadius(targetNode) : 8;

      // Calculate the vector from source to target
      const vx = targetX - sourceX;
      const vy = targetY - sourceY;

      // Calculate the unit vector
      const magnitude = Math.sqrt(vx * vx + vy * vy);
      const unitX = vx / magnitude;
      const unitY = vy / magnitude;

      // Adjust target point to be at the edge of the node plus a small margin
      // Use the node radius plus a small fixed amount (3px) for consistent arrows
      const margin = 3;
      const adjustmentDistance = targetRadius + margin;

      // Calculate the adjusted target point
      const adjustedTargetX = targetX - unitX * adjustmentDistance;
      const adjustedTargetY = targetY - unitY * adjustmentDistance;

      return `M${sourceX},${sourceY}A${curve},${curve} 0 0,1 ${adjustedTargetX},${adjustedTargetY}`;
    });

    node
      .attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Click on the background to clear selection
  svg.on('click', clearHighlights);

  // Restore zoom transform after rendering is complete
  if (zoomHandler && currentZoomTransform) {
    svg.call(zoomHandler.transform, currentZoomTransform);
  }
}

/**
 * Highlight connections for a selected node
 */
function highlightConnections(d) {
    // Clear previous highlights
    clearHighlights();

    // Set the selected node
    selectedFunction = d.id;

    // Determine which nodes to highlight based on the node type
    const nodesToHighlight = new Set();
    nodesToHighlight.add(d.id); // Always highlight the selected node

    if (d.type === 'module') {
      // Highlight all functions in this module
      const moduleFunctions = graphData.modules[d.id] || [];
      moduleFunctions.forEach(funcName => nodesToHighlight.add(funcName));
    } else if (d.type === 'function_module') {
      // Highlight all functions in this function module
      const functionModuleFunctions = graphData.function_modules[d.id] || [];
      functionModuleFunctions.forEach(funcName => nodesToHighlight.add(funcName));
    } else if (d.type === 'submodule') {
      // Highlight all modules in this submodule
      const submoduleModules = graphData.submodules[d.id] || [];
      submoduleModules.forEach(moduleName => {
        nodesToHighlight.add(moduleName);
        // Also highlight functions in these modules
        const moduleFunctions = graphData.modules[moduleName] || [];
        moduleFunctions.forEach(funcName => nodesToHighlight.add(funcName));
      });
    }

    // Get all connected links for the selected node
    const connectedLinks = links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return sourceId === d.id || targetId === d.id;
    });

    // Get all directly connected nodes (for highlighting connections)
    const connectedNodeIds = new Set(nodesToHighlight);
    connectedLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
    });

    // Highlight all relevant nodes
    svg.selectAll('.node circle')
      .attr('opacity', node => {
        return nodesToHighlight.has(node.id) || connectedNodeIds.has(node.id) ? 1 : 0.3;
      })
      .attr('r', node => {
        return node.id === d.id
          ? getNodeRadius(node) * 1.3
          : getNodeRadius(node);
      })
      .attr('stroke', node => {
        return nodesToHighlight.has(node.id) && node.id !== d.id ? '#FF6D00' : getNodeStroke(node);
      })
      .attr('stroke-width', node => {
        return node.id === d.id ? 3 :
               nodesToHighlight.has(node.id) ? 2 : 1.5;
      });

    svg.selectAll('.node text')
      .attr('opacity', node => {
        return nodesToHighlight.has(node.id) || connectedNodeIds.has(node.id) ? 1 : 0.3;
      })
      .style('font-weight', node => {
        return node.id === d.id || nodesToHighlight.has(node.id) ? 'bold' : 'normal';
      });

    // Highlight links connected to the selected node or any node in the group
    svg.selectAll('.link')
      .attr('opacity', link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return nodesToHighlight.has(sourceId) || nodesToHighlight.has(targetId) ? 1 : 0.1;
      })
      .attr('stroke-width', link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return nodesToHighlight.has(sourceId) || nodesToHighlight.has(targetId) ? 2 : 1;
      });

    // Update classes on nodes to reflect selection state
    svg.selectAll('.node')
      .classed('selected', node => node.id === d.id);
}

/**
 * Clear all highlights
 */
function clearHighlights() {
  selectedFunction = null;

  svg.selectAll('.node circle')
    .attr('opacity', 1)
    .attr('r', getNodeRadius)
    .attr('stroke', getNodeStroke)
    .attr('stroke-width', d => d.isExpanded ? 2 : 1.5);

  svg.selectAll('.node')
    .classed('selected', false);

  svg.selectAll('.node text')
    .attr('opacity', 1)
    .style('font-weight', d => d.type !== 'function' ? 'bold' : 'normal');

  svg.selectAll('.link')
    .attr('opacity', 0.7)
    .attr('stroke-width', d => Math.sqrt(d.value));

  // Clear sidebar selection
  document.querySelectorAll('.function-item.selected, .module-item.selected')
    .forEach(el => el.classList.remove('selected'));
}
