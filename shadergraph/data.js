// Data structures
let graphData = {
    functions: {},
    dependencies: {},
    modules: {},
    function_modules: {},
    submodules: {},
    module_hierarchy: {}
  };

  // Process parsed shader data
  function processData(data) {
    try {
      // Validate the data format
      if (!data.functions || !data.dependencies || !data.modules) {
        throw new Error("Data format is not compatible with the visualizer. Expected functions, dependencies, and modules.");
      }

      graphData = data;
      console.log('Data loaded successfully:', graphData);

      // Add default values for backward compatibility
      if (!graphData.function_modules) {
        console.log('No function modules found, creating empty object');
        graphData.function_modules = {};

        // Try to extract function modules from function names
        console.log("Creating function modules from function prefixes...");
        extractFunctionModules();
      }

      if (!graphData.submodules) {
        console.log('No submodules found, creating empty object');
        graphData.submodules = {};

        // Try to create submodules from module structure
        extractSubmodules();
      }

      // Ensure functions have necessary properties
      enrichFunctionData();

      // Log data structure to help debug
      console.log('Functions count:', Object.keys(data.functions).length);
      console.log('Modules count:', Object.keys(data.modules).length);
      console.log('Function Modules count:', Object.keys(graphData.function_modules).length);
      console.log('Submodules count:', Object.keys(graphData.submodules).length);

      // Log public/private counts
      let publicCount = 0;
      let privateCount = 0;
      Object.values(data.functions).forEach(func => {
        if (func.is_public) publicCount++;
        else privateCount++;
      });
      console.log(`Public functions: ${publicCount}, Private functions: ${privateCount}`);

      // Update UI with counts
      document.getElementById('private-count').textContent = `(${privateCount} private / ${publicCount} public functions)`;

      // Show the number of functions and modules
      const functionCount = Object.keys(graphData.functions).length;
      const moduleCount = Object.keys(graphData.modules).length;
      const functionModuleCount = Object.keys(graphData.function_modules).length;
      const submoduleCount = Object.keys(graphData.submodules).length;

      showStatus(`Loaded ${functionCount} functions from ${moduleCount} modules, ${functionModuleCount} function modules, and ${submoduleCount} submodules`, 3000);

      // Hide the initial message and show the graph
      initialMessage.style.display = 'none';
      svg.style('display', 'block');
      controls.style.display = 'block';

      // Initialize the graph
      initializeGraph();
      populateModuleList();
      populateFunctionModuleList();
      populateFunctionsList();
    } catch (error) {
      showStatus(`Error processing data: ${error.message}`, 5000);
      console.error("Error processing data:", error);
    }
  }

  // Extract function modules based on common prefixes in function names
  function extractFunctionModules() {
    const functionModules = {};

    Object.keys(graphData.functions).forEach(funcName => {
      // Look for prefixes like "prefix_" in function names
      const match = funcName.match(/^([a-zA-Z0-9]+)_/);
      if (match && match[1]) {
        const prefix = match[1];
        if (!functionModules[prefix]) {
          functionModules[prefix] = [];
        }
        functionModules[prefix].push(funcName);

        // Add function_module property to the function
        graphData.functions[funcName].function_module = prefix;
      }
    });

    // Only keep function modules with multiple functions
    Object.keys(functionModules).forEach(module => {
      if (functionModules[module].length > 1) {
        graphData.function_modules[module] = functionModules[module];
      }
    });

    console.log(`Created ${Object.keys(graphData.function_modules).length} function modules based on function prefixes`);
  }

  // Extract submodules based on folder structure - IMPROVED
  function extractSubmodules() {
    // Start with submodules from the data if available
    const existingSubmodules = {...graphData.submodules};

    console.log("Extracting submodules from folder structure...");

    // First identify parent modules (top-level modules)
    const parentModules = new Set();
    Object.keys(graphData.modules).forEach(moduleName => {
      // Check if this is a top-level module or a submodule
      const isSubmodule = Object.keys(graphData.modules).some(otherModule =>
        otherModule !== moduleName && moduleName.startsWith(otherModule + '_')
      );

      if (!isSubmodule) {
        parentModules.add(moduleName);
      }
    });

    console.log("Identified parent modules:", parentModules);

    // For each parent module, find all its submodules
    parentModules.forEach(parentModule => {
      // Find all module names that start with this parent module name
      // For example, if parentModule is "pbr", find "pbr_brdf", "pbr_material", etc.
      const submodulePattern = new RegExp(`^${parentModule}_([^_]+)`);

      // Map to keep track of direct submodules
      const directSubmodules = new Map();

      Object.keys(graphData.modules).forEach(moduleName => {
        if (moduleName !== parentModule && moduleName.startsWith(parentModule + '_')) {
          // This is a submodule
          const match = moduleName.match(submodulePattern);

          if (match && match[1]) {
            const submoduleSuffix = match[1];
            const directSubmoduleName = `${parentModule}_${submoduleSuffix}`;

            // Add to direct submodules
            if (!directSubmodules.has(directSubmoduleName)) {
              directSubmodules.set(directSubmoduleName, []);
            }

            // Add module to this submodule
            directSubmodules.get(directSubmoduleName).push(moduleName);

            // Also track if this is a direct match (e.g., "pbr_brdf" itself)
            if (directSubmoduleName === moduleName) {
              directSubmodules.get(directSubmoduleName).unshift(moduleName); // Put at the beginning
            }
          }
        }
      });

      // Add all direct submodules to the submodules collection
      directSubmodules.forEach((modules, submoduleName) => {
        existingSubmodules[submoduleName] = [...new Set(modules)];
      });

      // Also create a submodule for the parent module itself
      if (!existingSubmodules[parentModule]) {
        existingSubmodules[parentModule] = [parentModule];
      } else if (!existingSubmodules[parentModule].includes(parentModule)) {
        existingSubmodules[parentModule].unshift(parentModule);
      }

      // Find all modules that directly belong to this parent
      Object.keys(graphData.modules).forEach(moduleName => {
        if (moduleName !== parentModule && moduleName.startsWith(parentModule + '_')) {
          // Check if this module is not already in a specific submodule
          const isInSubmodule = directSubmodules.has(moduleName) ||
                                 Array.from(directSubmodules.keys()).some(submodule =>
                                   submodule !== moduleName && moduleName.startsWith(submodule + '_')
                                 );

          if (!isInSubmodule) {
            // Add to parent's direct submodule list
            if (!existingSubmodules[parentModule].includes(moduleName)) {
              existingSubmodules[parentModule].push(moduleName);
            }
          }
        }
      });
    });

    graphData.submodules = existingSubmodules;
    console.log(`Created/Updated ${Object.keys(existingSubmodules).length} submodules based on module naming:`, existingSubmodules);
  }

  // Ensure all functions have the necessary properties
  function enrichFunctionData() {
    Object.keys(graphData.functions).forEach(funcName => {
      const func = graphData.functions[funcName];

      // Ensure module property
      if (!func.module) {
        func.module = "unknown";
      }

      // Ensure function_module property
      if (!func.function_module) {
        // Try to extract from name
        const match = funcName.match(/^([a-zA-Z0-9]+)_/);
        if (match && match[1]) {
          func.function_module = match[1];
        } else {
          func.function_module = "unknown";
        }
      }

      // Ensure submodule property
      if (!func.submodule) {
        const moduleParts = func.module.split('_');
        if (moduleParts.length > 1) {
          func.submodule = `${moduleParts[0]}_${moduleParts[1]}`;
        } else {
          func.submodule = func.module;
        }
      }
    });
  }

  // Auto-load: Try to load from GitLab cache or fetch fresh data
  async function tryAutoLoad() {
    // Check if we have valid cached data
    const handler = new GitLabHandler();
    const cacheInfo = handler.getCacheInfo();

    if (cacheInfo && !cacheInfo.isExpired) {
      // We have valid cached data, auto-load it
      console.log('Found valid cache, auto-loading...');
      try {
        const data = await handler.processFromGitLab('master', (done, total, stage, details) => {
          showStatus(stage, 0, details);
        }, false);

        const stats = handler.getStats();
        const fileName = document.getElementById('file-name');
        if (fileName) {
          fileName.textContent = `GitLab: ${stats.files.shaders} shaders, ${stats.parsing.functions} functions [cached]`;
        }

        processData(data);
        showStatus(`Loaded ${stats.parsing.functions} functions from cache`, 2000);
      } catch (e) {
        console.log('Auto-load from cache failed:', e.message);
        // Don't show error, user can manually fetch
      }
    } else {
      console.log('No valid cache found. Click "Fetch from GitLab" or upload a local folder.');
    }
  }