const PATH = require('path');

// Component Manager Module
// Handles dynamic component registration and management

function ComponentManager() {
    
    function validateComponent(params) {
        const required = ['name', 'code'];
        for (const field of required) {
            if (!params[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        // Validate name format (alphanumeric and underscores only)
        if (!/^[a-zA-Z0-9_]+$/.test(params.name)) {
            throw new Error('Component name must contain only letters, numbers, and underscores');
        }
        
        return true;
    }
    
    function generateComponentHtml(params) {
        const {
            name, displayName, icon, group, color, code, readme, 
            settings, inputs, outputs, version, author, meta
        } = params;
        
        // Parse inputs/outputs/meta with defaults
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
            console.log('Using default inputs for component:', name);
        }
        
        try {
            if (outputs && typeof outputs === 'string') {
                parsedOutputs = JSON.parse(outputs);
            } else if (Array.isArray(outputs)) {
                parsedOutputs = outputs;
            }
        } catch (e) {
            console.log('Using default outputs for component:', name);
        }
        
        try {
            if (meta && typeof meta === 'string') {
                parsedMeta = JSON.parse(meta);
            } else if (typeof meta === 'object') {
                parsedMeta = meta;
            }
        } catch (e) {
            console.log('Using default meta for component:', name);
        }
        
        // Escape the code for safe inclusion in HTML (like old API)
        let escapedCode = code;
        if (escapedCode) {
            escapedCode = escapedCode.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        }

        // Build component HTML (same structure as native components)
        const componentHtml = `<script total>

    exports.id = '${name}';
    exports.name = '${displayName || name}';
    exports.icon = '${icon || 'ti ti-code'}';
    exports.author = '${author || 'API'}';
    exports.version = '${version || '1.0.0'}';
    exports.group = '${group || 'Custom'}';
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
                console.error('Error in component ${name}:', e);
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
# ${displayName || name}

Dynamically registered component via API.

**Group:** ${group || 'Custom'}
**Icon:** ${icon || 'ti ti-code'}
**Color:** ${color || '#ff6600'}

## Usage

This component was created via the REST API and processes input data using custom logic.

</readme>

<settings>
${settings || '<div class="padding">SETTINGS for this component (optional)</div>'}
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
        <i class="$ICON" style="color:${color || '#ff6600'}"></i>$NAME
    </header>
    <footer>API-registered component</footer>
</body>`;
        
        return componentHtml;
    }
    
    function registerComponent(params) {
        try {
            // Validate input
            validateComponent(params);
            
            const safeName = params.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            
            // Generate component HTML
            const componentHtml = generateComponentHtml(params);
            
                            // Save to Flow database (only actual components)
                if (!Flow.db.components) {
                    Flow.db.components = {};
                }
                Flow.db.components[safeName] = componentHtml;
            
            // Save to database file
            Flow.emit('save');
            
            // Register with all flows
            registerWithAllFlows(safeName, componentHtml);
            
            // Reload Flow system
            reloadFlowSystem();
            
            return {
                success: true,
                id: safeName,
                message: 'Component registered successfully',
                component: {
                    id: safeName,
                    name: params.displayName || params.name,
                    icon: params.icon || 'ti ti-code',
                    group: params.group || 'Custom',
                    color: params.color || '#ff6600'
                }
            };
            
        } catch (error) {
            throw new Error(`Failed to register component: ${error.message}`);
        }
    }
    
    function registerWithAllFlows(componentId, componentHtml) {
        if (!Flow.db) return;
        
        for (const [flowId, flow] of Object.entries(Flow.db)) {
            if (flowId === 'variables' || flowId === 'components') continue;
            
            if (!flow.components) {
                flow.components = {};
            }
            
            flow.components[componentId] = componentHtml;
        }
        
        Flow.emit('save');
    }
    
    function reloadFlowSystem() {
        try {
            const DB_FILE = 'database.json';
            const DIRECTORY = 'flowstream';
            
            require('fs').readFile(require('path').join(DIRECTORY, DB_FILE), function(err, data) {
                if (err) {
                    console.log('Failed to reload database:', err.message);
                    return;
                }
                
                Flow.db = data ? data.toString('utf8').parseJSON(true) : {};
                
                Object.keys(Flow.db).wait(function(key, next) {
                    if (key === 'variables' || key === 'components') {
                        next();
                    } else {
                        var flow = Flow.db[key];
                        flow.variables2 = Flow.db.variables || {};
                        flow.directory = CONF.directory || 'flowstream/';
                        flow.sandbox = CONF.flowstream_sandbox == true;
                        flow.env = PREF.env || 'dev';
                        
                        if (!flow.memory)
                            flow.memory = CONF.flowstream_memory || 0;
                        
                        flow.asfiles = CONF.flowstream_asfiles === true;
                        flow.worker = flow.worker;
                        
                        Flow.load(flow, function(err, instance) {
                            next();
                        });
                    }
                });
            });
            
        } catch (error) {
            console.log('Flow system reload failed:', error.message);
        }
    }
    
    return {
        register: registerComponent,
        validate: validateComponent,
        generateHtml: generateComponentHtml
    };
}

module.exports = ComponentManager; 