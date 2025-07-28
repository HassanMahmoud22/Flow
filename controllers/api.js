exports.install = function() {

	// REST API
	ROUTE('-POST    ?/auth/        --> Auth/exec');
	ROUTE('+GET     ?/logout/      --> Auth/logout');
	ROUTE('+POST    ?/password/    --> Auth/save');
	ROUTE('+POST    ?/update/ @upload <10MB', updatebundle); // Flow updater
	ROUTE('GET       /private/',          privatefiles);
	ROUTE('GET       /notify/{id}/',      notify);
	ROUTE('POST      /notify/{id}/ <1MB', notify); // 1 MB

	// FlowStream
	ROUTE('+API     ?    -streams                          --> Streams/query');
	ROUTE('+API     ?    -streams_read/{id}                --> Streams/read');
	ROUTE('+API     ?    +streams_save                     --> Streams/save');
	ROUTE('+API     ?    -streams_remove/{id}              --> Streams/remove');
	ROUTE('+API     ?    -streams_stats                    --> Streams/stats');
	ROUTE('+API     ?    -streams_pause/{id}               --> Streams/pause');
	ROUTE('+API     ?    -streams_restart/{id}             --> Streams/restart');
	ROUTE('+API     ?    -console                          --> Console/read');
	ROUTE('+API     ?    -console_clear                    --> Console/clear');
	ROUTE('+API     ?    -cdn_clear                        --> CDN/clear');

	// Common
	ROUTE('+API     ?    -auth                             --> Auth/read');

	// Variables
	ROUTE('+API     ?    -settings                         --> Settings/read');
	ROUTE('+API     ?    +settings_save                    --> Settings/save');

	// Variables
	ROUTE('+API     ?    -variables                        --> Variables/read');
	ROUTE('+API     ?    +variables_save                   --> Variables/save');

	// Clipboard
	ROUTE('+API     ?    -clipboard_export/id              --> Clipboard/export');
	ROUTE('+API     ?    +clipboard_import    <10MB <300s  --> Clipboard/import');

	// Socket
	ROUTE('+SOCKET  /flows/{id}/ <8MB', socket); // max. 8 MB
    
    // Flow Component Registry
    ROUTE('POST      /api/flow/register    <10MB <30s', register_component);
    ROUTE('GET       /api/flow/components', list_components);
    ROUTE('POST      /api/flow/refresh-components', refresh_components);
    
    // Register existing API components with all flows on startup
    setTimeout(() => {
        console.log('API component registry ready - registering with all flows');
        register_api_components_with_all_flows();
    }, 2000);
};

function build_native_like_component(comp) {
    let settings = comp.settings;
    if (!settings && comp.html) {
        const settingsMatch = comp.html.match(/<settings>([\s\S]*?)<\/settings>/);
        if (settingsMatch) {
            settings = settingsMatch[1].trim();
        }
    }
    settings = settings || ''; // Ensure settings is always a string

    // Ensure inputs, outputs, and meta are properly parsed
    let inputs = [{ id: 'input', name: 'Input' }];
    let outputs = [{ id: 'output', name: 'Output' }];
    let meta = { readonly: false, singleton: false, hidden: false, remove: true };
    
    try {
        if (comp.inputs) {
            if (typeof comp.inputs === 'string') {
                inputs = JSON.parse(comp.inputs);
            } else if (Array.isArray(comp.inputs)) {
                inputs = comp.inputs;
            }
        }
    } catch (e) {
        console.log(`Failed to parse inputs for ${comp.id}:`, e.message);
    }
    
    try {
        if (comp.outputs) {
            if (typeof comp.outputs === 'string') {
                outputs = JSON.parse(comp.outputs);
            } else if (Array.isArray(comp.outputs)) {
                outputs = comp.outputs;
            }
        }
    } catch (e) {
        console.log(`Failed to parse outputs for ${comp.id}:`, e.message);
    }
    
    try {
        if (comp.meta) {
            if (typeof comp.meta === 'string') {
                meta = JSON.parse(comp.meta);
            } else if (typeof comp.meta === 'object') {
                meta = comp.meta;
            }
        }
    } catch (e) {
        console.log(`Failed to parse meta for ${comp.id}:`, e.message);
    }

    return {
        id: comp.id,
        name: comp.name,
        icon: comp.icon,
        group: comp.group,
        color: comp.color,
        author: comp.author,
        version: comp.version,
        html: comp.html,
        settings: settings,
        inputs: inputs,
        outputs: outputs,
        config: comp.config || {},
        readme: comp.readme || '',
        meta: meta,
        type: 'component'
    };
}

function socket($) {
	Flow.socket($.params.id, $);
    console.log('Flow Designer connected - API components stored as HTML strings');
}

function register_component($) {
    try {
        console.log('=== COMPONENT REGISTRATION START ===');
        
        // Validate request body
        if (!$.body) {
            console.log('Request body is missing');
            $.invalid(400, 'Request body is required');
            return;
        }

        const { name, displayName, icon, group, color, code, readme, settings, inputs, outputs, version, author, meta } = $.body;

        // Validate required fields
        if (!name) {
            console.log('Component name is required');
            $.invalid(400, 'Component name is required');
            return;
        }

        if (!code) {
            console.log('Component code is required');
            $.invalid(400, 'Component code is required');
            return;
        }

        // Sanitize component name
        const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        if (safeName !== name.toLowerCase()) {
            console.log('Component name contains invalid characters, sanitized to:', safeName);
        }

        console.log('=== HTML GENERATION STEP ===');
        console.log('Component params:', JSON.stringify($.body, null, 2));

        // Generate component HTML using the native component template
        const componentHtml = generate_component_html({
            id: safeName,
            name: displayName || name,
            icon: icon || 'ti ti-code',
            group: group || 'Common',
            color: color || '#ff6600',
            code: code,
            readme: readme || 'API-registered component',
            settings: settings || '<div class="padding">SETTINGS for this component (optional)</div>',
            inputs: inputs || '[{"id":"input","name":"Input"}]',
            outputs: outputs || '[{"id":"output","name":"Output"}]',
            version: version || '1.0.0',
            author: author || 'API',
            meta: meta || '{"readonly": false, "singleton": false, "hidden": false, "remove": true}'
        });

        console.log('=== SAVE COMPONENT STEP ===');
        console.log('Flow.db exists:', !!Flow.db);
        console.log('Flow.db.components exists:', !!Flow.db.components);
        
        // Store component in Flow database
        if (!Flow.db.components) {
            console.log('Creating Flow.db.components object');
            Flow.db.components = {};
        }
        
        console.log('=== METADATA CREATION STEP ===');
        
        // Extract settings from HTML
        const settingsMatch = componentHtml.match(/<settings>([\s\S]*?)<\/settings>/);
        const extractedSettings = settingsMatch ? settingsMatch[1].trim() : '';
        console.log('Settings extracted, length:', extractedSettings ? extractedSettings.length : 0);
        
        // Parse inputs and outputs to ensure they are arrays, not strings
        let parsedInputs = [{ id: 'input', name: 'Input' }];
        let parsedOutputs = [{ id: 'output', name: 'Output' }, { id: 'error', name: 'Error' }];
        let parsedMeta = { readonly: false, singleton: false, hidden: false, remove: true };
        
        try {
            if (inputs && typeof inputs === 'string') {
                parsedInputs = JSON.parse(inputs);
            } else if (Array.isArray(inputs)) {
                parsedInputs = inputs;
            }
        } catch (e) {
            console.log('Failed to parse inputs, using default:', e.message);
        }
        
        try {
            if (outputs && typeof outputs === 'string') {
                parsedOutputs = JSON.parse(outputs);
            } else if (Array.isArray(outputs)) {
                parsedOutputs = outputs;
            }
        } catch (e) {
            console.log('Failed to parse outputs, using default:', e.message);
        }
        
        try {
            if (meta && typeof meta === 'string') {
                parsedMeta = JSON.parse(meta);
            } else if (typeof meta === 'object') {
                parsedMeta = meta;
            }
        } catch (e) {
            console.log('Failed to parse meta, using default:', e.message);
        }
        
        // Store component as HTML string (like native components) instead of JSON object
        // This ensures the native Flow system can load it automatically
        const componentHtmlString = componentHtml;
        
        console.log('Component HTML created:', {
            id: safeName,
            name: displayName || name,
            htmlLength: componentHtmlString ? componentHtmlString.length : 0
        });
        
        console.log('=== SAVE TO DATABASE STEP ===');
        
        // Save to Flow database as HTML string (like native components)
        Flow.db.components[safeName] = componentHtmlString;
        console.log('Component saved to Flow.db.components:', safeName);
        
        console.log('=== FLOW SAVE STEP ===');
        
        // Trigger Flow save
        console.log('Calling Flow.emit("save")...');
        Flow.emit('save');
        console.log('Flow.emit("save") completed');
        
        console.log('=== COMPONENT REGISTRATION COMPLETE ===');
        
        console.log('=== REGISTER WITH ALL FLOWS STEP ===');
        
        // Register the component with all existing flows
        register_component_with_all_flows(safeName, componentHtmlString);
        
        console.log('=== SUCCESS RESPONSE STEP ===');
        console.log('Component registered successfully:', safeName);
        
        // Force Flow to reload components from database.json
        console.log('=== FORCING FLOW DATABASE RELOAD ===');
        try {
            // Manually reload the database and reinitialize flows (like at startup)
            console.log('🔄 Manually reloading database and reinitializing flows...');
            try {
                const DB_FILE = 'database.json';
                const DIRECTORY = PATH.root('flowstream');
                
                // Read the database file again (like at startup)
                PATH.fs.readFile(PATH.join(DIRECTORY, DB_FILE), function(err, data) {
                    if (err) {
                        console.log('❌ Failed to read database:', err.message);
                        return;
                    }
                    
                    // Reload Flow.db from database (like at startup)
                    Flow.db = data ? data.toString('utf8').parseJSON(true) : {};
                    console.log('✅ Database reloaded, Flow.db updated');
                    
                    // Reinitialize all flows (like at startup)
                    Object.keys(Flow.db).wait(function(key, next) {
                        if (key === 'variables' || key === 'components') {
                            next();
                        } else {
                            // Reinitialize this flow
                            var flow = Flow.db[key];
                            flow.variables2 = Flow.db.variables || {};
                            flow.directory = CONF.directory || PATH.root('/flowstream/');
                            flow.sandbox = CONF.flowstream_sandbox == true;
                            flow.env = PREF.env || 'dev';
                            
                            if (!flow.memory)
                                flow.memory = CONF.flowstream_memory || 0;
                            
                            flow.asfiles = CONF.flowstream_asfiles === true;
                            flow.worker = CONF.flowstream_worker;
                            
                            Flow.load(flow, function(err, instance) {
                                console.log(`✅ Flow ${key} reinitialized`);
                                next();
                            });
                        }
                    }, function() {
                        console.log('✅ All flows reinitialized - components should now be available');
                    });
                });
                
            } catch (reloadError) {
                console.log('❌ Manual reload failed:', reloadError.message);
            }
            
            // Also trigger a save to ensure persistence
            if (typeof Flow.emit === 'function') {
                Flow.emit('save');
                console.log('✅ Flow.emit("save") triggered for persistence');
            }
            
            // Register with all flows for immediate availability
            register_api_components_with_all_flows();
            console.log('✅ Components registered with all flows');
            
            console.log('✅ Component registered successfully - Flow system should now include the new component');
            console.log('💡 Please refresh the browser page manually to see the new component');
            
        } catch (reloadError) {
            console.log('⚠️ Flow reload failed:', reloadError.message);
            // Fallback: try to register with flows anyway
            try {
                register_api_components_with_all_flows();
                console.log('✅ Fallback: Components registered with flows');
            } catch (fallbackError) {
                console.log('❌ Fallback also failed:', fallbackError.message);
            }
        }
        
        $.success({ 
            success: true, 
            id: safeName,
            message: 'Component registered successfully',
            component: {
                id: safeName,
                name: displayName || name,
                icon: icon || 'ti ti-code',
                group: group || 'Custom',
                color: color || '#ff6600'
            }
        });
        
    } catch (error) {
        console.error('Error registering component:', error);
        $.invalid(500, 'Failed to register component: ' + error.message);
    }
}

function register_component_with_all_flows(componentId, componentHtmlString) {
    try {
        console.log(`Registering component ${componentId} with all flows...`);
        
        // Register with all existing flows
        if (Flow.db) {
            for (const [flowId, flow] of Object.entries(Flow.db)) {
                // Skip non-flow entries (like 'variables', 'components')
                if (flowId === 'variables' || flowId === 'components') {
                    continue;
                }
                
                // Ensure flow has components object
                if (!flow.components) {
                    flow.components = {};
                }
                
                // Check if component already exists in this flow
                if (flow.components[componentId]) {
                    console.log(`Component ${componentId} already exists in flow ${flowId}, skipping...`);
                    continue;
                }
                
                // Add component to this flow as HTML string (like native components)
                flow.components[componentId] = componentHtmlString;
                console.log(`Added component ${componentId} to flow ${flowId}`);
            }
        }
        
        // Save the database to persist the changes
        Flow.emit('save');
        console.log(`Component ${componentId} registered with all flows and saved to database`);
        
    } catch (error) {
        console.error(`Error registering component ${componentId} with flows:`, error);
    }
}



function register_api_components_with_all_flows() {
    try {
        if (!Flow.db || !Flow.db.components) {
            console.log('No API components to register with flows');
            return;
        }
        
        console.log('Registering API components with all flows...');
        
        // Register each API component with all flows
        for (const [componentId, componentHtmlString] of Object.entries(Flow.db.components)) {
            // Check if this is an API component by looking for 'API' in the HTML string
            if (componentHtmlString && typeof componentHtmlString === 'string' && componentHtmlString.includes("author = 'API'")) {
                console.log(`Registering component ${componentId} with all flows...`);
                register_component_with_all_flows(componentId, componentHtmlString);
            }
        }
        
        console.log('API components registered with all flows');
        
    } catch (error) {
        console.error('Error registering API components with flows:', error);
    }
}

function list_components($) {
    try {
        const components = Flow.db.components || {};
        const componentList = Object.keys(components)
            .filter(id => components[id] && typeof components[id] === 'string') // Filter out empty objects
            .map(id => {
                const htmlString = components[id];
                // Extract component metadata from HTML string
                const idMatch = htmlString.match(/exports\.id\s*=\s*['"`]([^'"`]+)['"`]/);
                const nameMatch = htmlString.match(/exports\.name\s*=\s*['"`]([^'"`]+)['"`]/);
                const iconMatch = htmlString.match(/exports\.icon\s*=\s*['"`]([^'"`]+)['"`]/);
                const groupMatch = htmlString.match(/exports\.group\s*=\s*['"`]([^'"`]+)['"`]/);
                const authorMatch = htmlString.match(/exports\.author\s*=\s*['"`]([^'"`]+)['"`]/);
                const versionMatch = htmlString.match(/exports\.version\s*=\s*['"`]([^'"`]+)['"`]/);
                
                // Only include components that have proper metadata (skip malformed ones)
                if (!idMatch || !nameMatch) {
                    return null;
                }
                
                return {
                    id: idMatch ? idMatch[1] : id,
                    name: nameMatch ? nameMatch[1] : id,
                    icon: iconMatch ? iconMatch[1] : 'ti ti-code',
                    group: groupMatch ? groupMatch[1] : 'Common',
                    color: '#ff6600', // Default color for API components
                    author: authorMatch ? authorMatch[1] : 'API',
                    version: versionMatch ? versionMatch[1] : '1.0.0'
                };
            })
            .filter(comp => comp !== null); // Filter out null values
        
        $.success({
            success: true,
            count: componentList.length,
            components: componentList
        });
    } catch (e) {
        console.error('Error listing components:', e);
        $.invalid(500, 'Failed to list components: ' + e.message);
    }
}

function refresh_components($) {
    try {
        console.log('Refreshing components...');
        // Register API components with all flows
        register_api_components_with_all_flows();
        
        $.success({
            success: true,
            message: 'Components refreshed successfully'
        });
        
    } catch (e) {
        console.error('Error refreshing components:', e);
        $.invalid(500, 'Failed to refresh components: ' + e.message);
    }
}

function generate_component_html(params) {
    console.log('=== GENERATE_COMPONENT_HTML START ===');
    console.log('Component input:', {
        id: params.id,
        name: params.name,
        codeLength: params.code ? params.code.length : 0
    });

    // Escape the code for safe inclusion in HTML
    let escapedCode = params.code;
    if (escapedCode) {
        escapedCode = escapedCode.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        console.log('Escaping code...');
        console.log('Code escaped, length:', escapedCode.length);
    }

    // Parse inputs and outputs
    let parsedInputs = [{ id: 'input', name: 'Input' }];
    let parsedOutputs = [{ id: 'output', name: 'Output' }];
    
    try {
        if (params.inputs && typeof params.inputs === 'string') {
            parsedInputs = JSON.parse(params.inputs);
        } else if (Array.isArray(params.inputs)) {
            parsedInputs = params.inputs;
        }
    } catch (e) {
        console.log('Failed to parse inputs, using default');
    }
    
    try {
        if (params.outputs && typeof params.outputs === 'string') {
            parsedOutputs = JSON.parse(params.outputs);
        } else if (Array.isArray(params.outputs)) {
            parsedOutputs = params.outputs;
        }
    } catch (e) {
        console.log('Failed to parse outputs, using default');
    }

    // Generate the component HTML using the native component template
    const html = `<script total>

    exports.id = '${params.id}';
    exports.name = '${params.name}';
    exports.icon = '${params.icon}';
    exports.author = '${params.author}';
    exports.version = '${params.version}';
    exports.group = '${params.group}';
    exports.config = {};
    exports.inputs = ${JSON.stringify(parsedInputs).replace(/"/g, "'")};
    exports.outputs = ${JSON.stringify(parsedOutputs).replace(/"/g, "'")};

    exports.make = function(instance, config) {

        instance.message = function($) {
            var data = $.data;
            
            // Execute user-provided code
            try {
                ${escapedCode}
            } catch (e) {
                console.error('Error in component ${params.id}:', e);
                $.send('output', { error: e.message, originalData: data });
            }
        };

        instance.configure = function() {
            // Configuration changed
        };

        instance.close = function() {
            // Instance closed
        };

        instance.vary = function(type) {
            // Variables changed
        };

        instance.configure();
    };

</script>

<readme>
# ${params.name}

Dynamically registered component via API.

**Group:** ${params.group}
**Icon:** ${params.icon}
**Color:** ${params.color}

## Usage

This component was created via the REST API and processes input data using custom logic.

</readme>

<settings>
${params.settings}
</settings>

<style>
    .CLASS footer { padding: 10px; font-size: 12px; }
</style>

<script>

    // Client-side script for component lifecycle
    TOUCH(function(exports, reinit) {

        var name = exports.name + ' --> ' + exports.id;

        console.log(name, 'initialized' + (reinit ? ' : UPDATE' : ''));

        exports.settings = function(meta) {
            // Triggered when the user opens settings
            console.log(name, 'settings', meta);
        };

        exports.configure = function(config, isinit) {
            // Triggered when the config is changed
            console.log(name, 'configure', config);
        };

        exports.status = function(status, isinit) {
            // Triggered when the status is changed
            console.log(name, 'status', status);
        };

        exports.note = function(note, isinit) {
            // Triggered when the note is changed
            console.log(name, 'note', note);
        };

        exports.variables = function(variables) {
            // Triggered when the variables are changed
            console.log(name, 'variables', variables);
        };

        exports.variables2 = function(variables) {
            // Triggered when the variables2 are changed
            console.log(name, 'variables2', variables);
        };

        exports.redraw = function() {
            // Flow design has been redrawn
            console.log(name, 'redraw');
        };

        exports.move = function() {
            // Instance has changed position
            console.log(name, 'move');
        };

        exports.close = function() {
            // Triggered when the instance is closing due to some reasons
            console.log(name, 'close');
        };

    });

</script>

<body>
    <header>
        <i class="$ICON" style="color:${params.color}"></i>$NAME
    </header>
    <footer>API-registered component</footer>
</body>`;

    console.log('=== GENERATE_COMPONENT_HTML END ===');
    console.log('Generated HTML length:', html.length);
    console.log('HTML generation completed, length:', html.length);

    return html;
}

    // Integrated API component loading - components are merged directly into Flow system
    ON('ready', function() {
        console.log('API component registry ready - components will be integrated into Flow system');
    });
    


function privatefiles($) {

	if (!PREF.token) {
		$.invalid(401);
		return;
	}

	if (BLOCKED($, 10, '15 minutes'))
		return;

	if ($.query.token !== PREF.token) {
		$.invalid(401);
		return;
	}

	BLOCKED($, -1);

	var filename = $.query.filename;
	if (filename) {

		filename = filename.replace(/\.{2,}|~|\+|\/|\\/g, '');
		$.nocache();

		var path = PATH.private(filename);

		F.Fs.lstat(path, function(err, stat) {

			if (err) {
				$.throw404();
				return;
			}

			var offset = $.query.offset;
			var opt = {};

			if (offset) {
				offset = U.parseInt(offset);
				opt.start = offset;
			}

			var stream = F.Fs.createReadStream(path, opt);

			$.nocache();
			$.stream(stream, U.contentTypes[U.getExtension(path)], filename, { 'x-size': stat.size, 'last-modified': stat.mtime.toUTCString() });

		});

		return;
	}

	var q = $.query.q;

	U.ls2(PATH.private(), function(files) {
		var arr = [];
		for (var file of files)
			arr.push({ name: file.filename.substring(file.filename.lastIndexOf('/') + 1), size: file.stats.size, modified: file.stats.mtime });
		$.json(arr);
	}, q);
}

function updatebundle($) {

	var file = $.files[0];

	if (!F.isBundle) {
		$.invalid('@(Available for bundled version only)');
		return;
	}

	if (file && file.ext === 'bundle') {
		file.move(PATH.join(PATH.root(), '../bundles/app.bundle'), function(err) {
			if (err) {
				$.invalid(err);
			} else {
				$.success();
				setTimeout(() => F.restart(), 1000);
			}
		});
	} else
		$.invalid('Invalid file');
}

function notify($) {
	Flow.notify($, $.params.id);
}
