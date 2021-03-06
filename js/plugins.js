// Avoid `console` errors in browsers that lack a console.
(function() {
    var method;
    var noop = function () {};
    var methods = [
        'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
        'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
        'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
        'timeStamp', 'trace', 'warn'
    ];
    var length = methods.length;
    var console = (window.console = window.console || {});

    while (length--) {
        method = methods[length];

        // Only stub undefined methods.
        if (!console[method]) {
            console[method] = noop;
        }
    }
}());

// Place any jQuery/helper plugins in here.


/* ----------- PX Loader ------------ */

/*global define: true */ 

(function(global) {

    /*
     * PixelLab Resource Loader
     * Loads resources while providing progress updates.
     */
    function PxLoader(settings) {

        // merge settings with defaults
        settings = settings || {};
        this.settings = settings;

        // how frequently we poll resources for progress
        if (settings.statusInterval == null) {
            settings.statusInterval = 5000; // every 5 seconds by default
        }

        // delay before logging since last progress change
        if (settings.loggingDelay == null) {
            settings.loggingDelay = 20 * 1000; // log stragglers after 20 secs
        }

        // stop waiting if no progress has been made in the moving time window
        if (settings.noProgressTimeout == null) {
            settings.noProgressTimeout = Infinity; // do not stop waiting by default
        }

        var entries = [],
            // holds resources to be loaded with their status
            progressListeners = [],
            timeStarted, progressChanged = Date.now();

        /**
         * The status of a resource
         * @enum {number}
         */
        var ResourceState = {
            QUEUED: 0,
            WAITING: 1,
            LOADED: 2,
            ERROR: 3,
            TIMEOUT: 4
        };

        // places non-array values into an array.
        var ensureArray = function(val) {
            if (val == null) {
                return [];
            }

            if (Array.isArray(val)) {
                return val;
            }

            return [val];
        };

        // add an entry to the list of resources to be loaded
        this.add = function(resource) {

            // TODO: would be better to create a base class for all resources and
            // initialize the PxLoaderTags there rather than overwritting tags here
            resource.tags = new PxLoaderTags(resource.tags);

            // ensure priority is set
            if (resource.priority == null) {
                resource.priority = Infinity;
            }

            entries.push({
                resource: resource,
                status: ResourceState.QUEUED
            });
        };

        this.addProgressListener = function(callback, tags) {
            progressListeners.push({
                callback: callback,
                tags: new PxLoaderTags(tags)
            });
        };

        this.addCompletionListener = function(callback, tags) {
            progressListeners.push({
                tags: new PxLoaderTags(tags),
                callback: function(e) {
                    if (e.completedCount === e.totalCount) {
                        callback(e);
                    }
                }
            });
        };

        // creates a comparison function for resources
        var getResourceSort = function(orderedTags) {

            // helper to get the top tag's order for a resource
            orderedTags = ensureArray(orderedTags);
            var getTagOrder = function(entry) {
                var resource = entry.resource,
                    bestIndex = Infinity;
                for (var i = 0; i < resource.tags.length; i++) {
                    for (var j = 0; j < Math.min(orderedTags.length, bestIndex); j++) {
                        if (resource.tags.all[i] === orderedTags[j] && j < bestIndex) {
                            bestIndex = j;
                            if (bestIndex === 0) {
                                break;
                            }
                        }
                        if (bestIndex === 0) {
                            break;
                        }
                    }
                }
                return bestIndex;
            };
            return function(a, b) {
                // check tag order first
                var aOrder = getTagOrder(a),
                    bOrder = getTagOrder(b);
                if (aOrder < bOrder) { return -1; }
                if (aOrder > bOrder) { return 1; }

                // now check priority
                if (a.priority < b.priority) { return -1; }
                if (a.priority > b.priority) { return 1; }
                return 0;
            };
        };

        this.start = function(orderedTags) {
            timeStarted = Date.now();

            // first order the resources
            var compareResources = getResourceSort(orderedTags);
            entries.sort(compareResources);

            // trigger requests for each resource
            for (var i = 0, len = entries.length; i < len; i++) {
                var entry = entries[i];
                entry.status = ResourceState.WAITING;
                entry.resource.start(this);
            }

            // do an initial status check soon since items may be loaded from the cache
            setTimeout(statusCheck, 100);
        };

        var statusCheck = function() {
            var checkAgain = false,
                noProgressTime = Date.now() - progressChanged,
                timedOut = (noProgressTime >= settings.noProgressTimeout),
                shouldLog = (noProgressTime >= settings.loggingDelay);

            for (var i = 0, len = entries.length; i < len; i++) {
                var entry = entries[i];
                if (entry.status !== ResourceState.WAITING) {
                    continue;
                }

                // see if the resource has loaded
                if (entry.resource.checkStatus) {
                    entry.resource.checkStatus();
                }

                // if still waiting, mark as timed out or make sure we check again
                if (entry.status === ResourceState.WAITING) {
                    if (timedOut) {
                        entry.resource.onTimeout();
                    } else {
                        checkAgain = true;
                    }
                }
            }

            // log any resources that are still pending
            if (shouldLog && checkAgain) {
                log();
            }

            if (checkAgain) {
                setTimeout(statusCheck, settings.statusInterval);
            }
        };

        this.isBusy = function() {
            for (var i = 0, len = entries.length; i < len; i++) {
                if (entries[i].status === ResourceState.QUEUED || entries[i].status === ResourceState.WAITING) {
                    return true;
                }
            }
            return false;
        };

        var onProgress = function(resource, statusType) {
            
            var entry = null,
                i, len, numResourceTags, listener, shouldCall;

            // find the entry for the resource    
            for (i = 0, len = entries.length; i < len; i++) {
                if (entries[i].resource === resource) {
                    entry = entries[i];
                    break;
                }
            }

            // we have already updated the status of the resource
            if (entry == null || entry.status !== ResourceState.WAITING) {
                return;
            }
            entry.status = statusType;
            progressChanged = Date.now();

            numResourceTags = resource.tags.length;

            // fire callbacks for interested listeners
            for (i = 0, len = progressListeners.length; i < len; i++) {
                
                listener = progressListeners[i];
                if (listener.tags.length === 0) {
                    // no tags specified so always tell the listener
                    shouldCall = true;
                } else {
                    // listener only wants to hear about certain tags
                    shouldCall = resource.tags.intersects(listener.tags);
                }

                if (shouldCall) {
                    sendProgress(entry, listener);
                }
            }
        };

        this.onLoad = function(resource) {
            onProgress(resource, ResourceState.LOADED);
        };
        this.onError = function(resource) {
            onProgress(resource, ResourceState.ERROR);
        };
        this.onTimeout = function(resource) {
            onProgress(resource, ResourceState.TIMEOUT);
        };

        // sends a progress report to a listener
        var sendProgress = function(updatedEntry, listener) {
            // find stats for all the resources the caller is interested in
            var completed = 0,
                total = 0,
                i, len, entry, includeResource;
            for (i = 0, len = entries.length; i < len; i++) {
                
                entry = entries[i];
                includeResource = false;

                if (listener.tags.length === 0) {
                    // no tags specified so always tell the listener
                    includeResource = true;
                } else {
                    includeResource = entry.resource.tags.intersects(listener.tags);
                }

                if (includeResource) {
                    total++;
                    if (entry.status === ResourceState.LOADED ||
                        entry.status === ResourceState.ERROR ||
                        entry.status === ResourceState.TIMEOUT) {

                        completed++;
                    }
                }
            }

            listener.callback({
                // info about the resource that changed
                resource: updatedEntry.resource,

                // should we expose StatusType instead?
                loaded: (updatedEntry.status === ResourceState.LOADED),
                error: (updatedEntry.status === ResourceState.ERROR),
                timeout: (updatedEntry.status === ResourceState.TIMEOUT),

                // updated stats for all resources
                completedCount: completed,
                totalCount: total
            });
        };

        // prints the status of each resource to the console
        var log = this.log = function(showAll) {
            if (!window.console) {
                return;
            }

            var elapsedSeconds = Math.round((Date.now() - timeStarted) / 1000);
            window.console.log('PxLoader elapsed: ' + elapsedSeconds + ' sec');

            for (var i = 0, len = entries.length; i < len; i++) {
                var entry = entries[i];
                if (!showAll && entry.status !== ResourceState.WAITING) {
                    continue;
                }

                var message = 'PxLoader: #' + i + ' ' + entry.resource.getName();
                switch(entry.status) {
                    case ResourceState.QUEUED:
                        message += ' (Not Started)';
                        break;
                    case ResourceState.WAITING:
                        message += ' (Waiting)';
                        break;
                    case ResourceState.LOADED:
                        message += ' (Loaded)';
                        break;
                    case ResourceState.ERROR:
                        message += ' (Error)';
                        break;
                    case ResourceState.TIMEOUT:
                        message += ' (Timeout)';
                        break;
                }

                if (entry.resource.tags.length > 0) {
                    message += ' Tags: [' + entry.resource.tags.all.join(',') + ']';
                }

                window.console.log(message);
            }
        };
    }


    // Tag object to handle tag intersection; once created not meant to be changed
    // Performance rationale: http://jsperf.com/lists-indexof-vs-in-operator/3
     
    function PxLoaderTags(values) {
     
        this.all = [];
        this.first = null; // cache the first value
        this.length = 0;

        // holds values as keys for quick lookup
        this.lookup = {};
     
        if (values) {

            // first fill the array of all values
            if (Array.isArray(values)) {
                // copy the array of values, just to be safe                
                this.all = values.slice(0);
            } else if (typeof values === 'object') {
                for (var key in values) {
                    if(values.hasOwnProperty(key)) {
                        this.all.push(key);
                    }
                }
            } else {
                this.all.push(values);
            }

            // cache the length and the first value
            this.length = this.all.length;
            if (this.length > 0) {
                this.first = this.all[0];
            }
     
            // set values as object keys for quick lookup during intersection test
            for (var i = 0; i < this.length; i++) {
                this.lookup[this.all[i]] = true;
            }
        }
    }

    // compare this object with another; return true if they share at least one value
    PxLoaderTags.prototype.intersects = function(other) {

        // handle empty values case
        if (this.length === 0 || other.length === 0) {
            return false;
        } 

        // only a single value to compare?
        if (this.length === 1 && other.length === 1) {
            return this.first === other.first;
        }

        // better to loop through the smaller object
        if (other.length < this.length) {
            return other.intersects(this); 
        }
         
        // loop through every key to see if there are any matches
        for (var key in this.lookup) {
            if (other.lookup[key]) {
                return true;
            }
        }

        return false;
    };

    // AMD module support
    if (typeof define === 'function' && define.amd) {
        define('PxLoader', [], function() {
            return PxLoader;
        });
    }

    // exports
    global.PxLoader = PxLoader;

}(this));

// Date.now() shim for older browsers
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}

// shims to ensure we have newer Array utility methods
// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/isArray
if (!Array.isArray) {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}



/*global PxLoader: true, define: true */ 

// PxLoader plugin to load images
function PxLoaderImage(url, tags, priority) {
    var self = this,
        loader = null;

    this.img = new Image();
    this.tags = tags;
    this.priority = priority;

    var onReadyStateChange = function() {
        if (self.img.readyState === 'complete') {
            removeEventHandlers();
            loader.onLoad(self);
        }
    };

    var onLoad = function() {
        removeEventHandlers();
        loader.onLoad(self);
    };

    var onError = function() {
        removeEventHandlers();
        loader.onError(self);
    };

    var removeEventHandlers = function() {
        self.unbind('load', onLoad);
        self.unbind('readystatechange', onReadyStateChange);
        self.unbind('error', onError);
    };

    this.start = function(pxLoader) {
        // we need the loader ref so we can notify upon completion
        loader = pxLoader;

        // NOTE: Must add event listeners before the src is set. We
        // also need to use the readystatechange because sometimes
        // load doesn't fire when an image is in the cache.
        self.bind('load', onLoad);
        self.bind('readystatechange', onReadyStateChange);
        self.bind('error', onError);

        self.img.src = url;
    };

    // called by PxLoader to check status of image (fallback in case
    // the event listeners are not triggered).
    this.checkStatus = function() {
        if (self.img.complete) {
            removeEventHandlers();
            loader.onLoad(self);
        }
    };

    // called by PxLoader when it is no longer waiting
    this.onTimeout = function() {
        removeEventHandlers();
        if (self.img.complete) {
            loader.onLoad(self);
        } else {
            loader.onTimeout(self);
        }
    };

    // returns a name for the resource that can be used in logging
    this.getName = function() {
        return url;
    };

    // cross-browser event binding
    this.bind = function(eventName, eventHandler) {
        if (self.img.addEventListener) {
            self.img.addEventListener(eventName, eventHandler, false);
        } else if (self.img.attachEvent) {
            self.img.attachEvent('on' + eventName, eventHandler);
        }
    };

    // cross-browser event un-binding
    this.unbind = function(eventName, eventHandler) {
        if (self.img.removeEventListener) {
            self.img.removeEventListener(eventName, eventHandler, false);
        } else if (self.img.detachEvent) {
            self.img.detachEvent('on' + eventName, eventHandler);
        }
    };

}

// add a convenience method to PxLoader for adding an image
PxLoader.prototype.addImage = function(url, tags, priority) {
    var imageLoader = new PxLoaderImage(url, tags, priority);
    this.add(imageLoader);

    // return the img element to the caller
    return imageLoader.img;
};

// AMD module support
if (typeof define === 'function' && define.amd) {
    define('PxLoaderImage', [], function() {
        return PxLoaderImage;
    });
}


/*! Copyright (c) 2011 Piotr Rochala (http://rocha.la)
 * Dual licensed under the MIT (http://www.opensource.org/licenses/mit-license.php)
 * and GPL (http://www.opensource.org/licenses/gpl-license.php) licenses.
 *
 * Version: 1.3.2 (modified for fullpage.js)
 *
 */
(function(f){jQuery.fn.extend({slimScroll:function(g){var a=f.extend({width:"auto",height:"250px",size:"7px",color:"#000",position:"right",distance:"1px",start:"top",opacity:.4,alwaysVisible:!1,disableFadeOut:!1,railVisible:!1,railColor:"#333",railOpacity:.2,railDraggable:!0,railClass:"slimScrollRail",barClass:"slimScrollBar",wrapperClass:"slimScrollDiv",allowPageScroll:!1,wheelStep:20,touchScrollStep:200,borderRadius:"7px",railBorderRadius:"7px"},g);this.each(function(){function s(d){d=d||window.event;
var c=0;d.wheelDelta&&(c=-d.wheelDelta/120);d.detail&&(c=d.detail/3);f(d.target||d.srcTarget||d.srcElement).closest("."+a.wrapperClass).is(b.parent())&&m(c,!0);d.preventDefault&&!k&&d.preventDefault();k||(d.returnValue=!1)}function m(d,f,g){k=!1;var e=d,h=b.outerHeight()-c.outerHeight();f&&(e=parseInt(c.css("top"))+d*parseInt(a.wheelStep)/100*c.outerHeight(),e=Math.min(Math.max(e,0),h),e=0<d?Math.ceil(e):Math.floor(e),c.css({top:e+"px"}));l=parseInt(c.css("top"))/(b.outerHeight()-c.outerHeight());
e=l*(b[0].scrollHeight-b.outerHeight());g&&(e=d,d=e/b[0].scrollHeight*b.outerHeight(),d=Math.min(Math.max(d,0),h),c.css({top:d+"px"}));b.scrollTop(e);b.trigger("slimscrolling",~~e);u();p()}function C(){window.addEventListener?(this.addEventListener("DOMMouseScroll",s,!1),this.addEventListener("mousewheel",s,!1)):document.attachEvent("onmousewheel",s)}function v(){r=Math.max(b.outerHeight()/b[0].scrollHeight*b.outerHeight(),D);c.css({height:r+"px"});var a=r==b.outerHeight()?"none":"block";c.css({display:a})}
function u(){v();clearTimeout(A);l==~~l?(k=a.allowPageScroll,B!=l&&b.trigger("slimscroll",0==~~l?"top":"bottom")):k=!1;B=l;r>=b.outerHeight()?k=!0:(c.stop(!0,!0).fadeIn("fast"),a.railVisible&&h.stop(!0,!0).fadeIn("fast"))}function p(){a.alwaysVisible||(A=setTimeout(function(){a.disableFadeOut&&w||x||y||(c.fadeOut("slow"),h.fadeOut("slow"))},1E3))}var w,x,y,A,z,r,l,B,D=30,k=!1,b=f(this);if(b.parent().hasClass(a.wrapperClass)){var n=b.scrollTop(),c=b.parent().find("."+a.barClass),h=b.parent().find("."+
a.railClass);v();if(f.isPlainObject(g)){if("height"in g&&"auto"==g.height){b.parent().css("height","auto");b.css("height","auto");var q=b.parent().parent().height();b.parent().css("height",q);b.css("height",q)}if("scrollTo"in g)n=parseInt(a.scrollTo);else if("scrollBy"in g)n+=parseInt(a.scrollBy);else if("destroy"in g){c.remove();h.remove();b.unwrap();return}m(n,!1,!0)}}else{a.height="auto"==g.height?b.parent().height():g.height;n=f("<div></div>").addClass(a.wrapperClass).css({position:"relative",
overflow:"hidden",width:a.width,height:a.height});b.css({overflow:"hidden",width:a.width,height:a.height});var h=f("<div></div>").addClass(a.railClass).css({width:a.size,height:"100%",position:"absolute",top:0,display:a.alwaysVisible&&a.railVisible?"block":"none","border-radius":a.railBorderRadius,background:a.railColor,opacity:a.railOpacity,zIndex:90}),c=f("<div></div>").addClass(a.barClass).css({background:a.color,width:a.size,position:"absolute",top:0,opacity:a.opacity,display:a.alwaysVisible?
"block":"none","border-radius":a.borderRadius,BorderRadius:a.borderRadius,MozBorderRadius:a.borderRadius,WebkitBorderRadius:a.borderRadius,zIndex:99}),q="right"==a.position?{right:a.distance}:{left:a.distance};h.css(q);c.css(q);b.wrap(n);b.parent().append(c);b.parent().append(h);a.railDraggable&&c.bind("mousedown",function(a){var b=f(document);y=!0;t=parseFloat(c.css("top"));pageY=a.pageY;b.bind("mousemove.slimscroll",function(a){currTop=t+a.pageY-pageY;c.css("top",currTop);m(0,c.position().top,!1)});
b.bind("mouseup.slimscroll",function(a){y=!1;p();b.unbind(".slimscroll")});return!1}).bind("selectstart.slimscroll",function(a){a.stopPropagation();a.preventDefault();return!1});h.hover(function(){u()},function(){p()});c.hover(function(){x=!0},function(){x=!1});b.hover(function(){w=!0;u();p()},function(){w=!1;p()});b.bind("touchstart",function(a,b){a.originalEvent.touches.length&&(z=a.originalEvent.touches[0].pageY)});b.bind("touchmove",function(b){k||b.originalEvent.preventDefault();b.originalEvent.touches.length&&
(m((z-b.originalEvent.touches[0].pageY)/a.touchScrollStep,!0),z=b.originalEvent.touches[0].pageY)});v();"bottom"===a.start?(c.css({top:b.outerHeight()-c.outerHeight()}),m(0,!0)):"top"!==a.start&&(m(f(a.start).position().top,null,!0),a.alwaysVisible||c.hide());C()}});return this}});jQuery.fn.extend({slimscroll:jQuery.fn.slimScroll})})(jQuery);


/**
 * fullPage 2.6.2
 * https://github.com/alvarotrigo/fullPage.js
 * MIT licensed
 *
 * Copyright (C) 2015 alvarotrigo.com - A project by Alvaro Trigo
 */
(function(d,h,k,m,H){var l=d(h),n=d(k);d.fn.fullpage=function(c){function Da(a){a.find(".fp-slides").after('<div class="fp-controlArrow fp-prev"></div><div class="fp-controlArrow fp-next"></div>');"#fff"!=c.controlArrowColor&&(a.find(".fp-controlArrow.fp-next").css("border-color","transparent transparent transparent "+c.controlArrowColor),a.find(".fp-controlArrow.fp-prev").css("border-color","transparent "+c.controlArrowColor+" transparent transparent"));c.loopHorizontal||a.find(".fp-controlArrow.fp-prev").hide()}
function Ea(){q.append('<div id="fp-nav"><ul></ul></div>');z=d("#fp-nav");z.addClass(function(){return c.showActiveTooltip?"fp-show-active "+c.navigationPosition:c.navigationPosition});for(var a=0;a<d(".fp-section").length;a++){var b="";c.anchors.length&&(b=c.anchors[a]);var b='<li><a href="#'+b+'"><span></span></a>',g=c.navigationTooltips[a];"undefined"!==typeof g&&""!==g&&(b+='<div class="fp-tooltip '+c.navigationPosition+'">'+g+"</div>");b+="</li>";z.find("ul").append(b)}}function ba(){d(".fp-section").each(function(){var a=
d(this).find(".fp-slide");a.length?a.each(function(){I(d(this))}):I(d(this))});d.isFunction(c.afterRender)&&c.afterRender.call(this)}function ca(){var a;if(!c.autoScrolling||c.scrollBar){for(var b=l.scrollTop(),g=0,p=m.abs(b-k.querySelectorAll(".fp-section")[0].offsetTop),e=k.querySelectorAll(".fp-section"),f=0;f<e.length;++f){var h=m.abs(b-e[f].offsetTop);h<p&&(g=f,p=h)}a=d(e).eq(g)}if(!c.autoScrolling||c.scrollBar){if(!a.hasClass("active")){T=!0;b=d(".fp-section.active");g=b.index(".fp-section")+
1;p=U(a);e=a.data("anchor");f=a.index(".fp-section")+1;h=a.find(".fp-slide.active");if(h.length)var n=h.data("anchor"),q=h.index();t&&(a.addClass("active").siblings().removeClass("active"),d.isFunction(c.onLeave)&&c.onLeave.call(b,g,f,p),d.isFunction(c.afterLoad)&&c.afterLoad.call(a,e,f),J(e,f-1),c.anchors.length&&(A=e,V(q,n,e,f)));clearTimeout(da);da=setTimeout(function(){T=!1},100)}c.fitToSection&&(clearTimeout(ea),ea=setTimeout(function(){t&&(d(".fp-section.active").is(a)&&(v=!0),u(a),v=!1)},1E3))}}
function fa(a){return a.find(".fp-slides").length?a.find(".fp-slide.active").find(".fp-scrollable"):a.find(".fp-scrollable")}function K(a,b){if(w[a]){var c,d;"down"==a?(c="bottom",d=e.moveSectionDown):(c="top",d=e.moveSectionUp);if(0<b.length)if(c="top"===c?!b.scrollTop():"bottom"===c?b.scrollTop()+1+b.innerHeight()>=b[0].scrollHeight:void 0,c)d();else return!0;else d()}}function Fa(a){var b=a.originalEvent;if(!ga(a.target)&&W(b)){c.autoScrolling&&a.preventDefault();a=d(".fp-section.active");var g=
fa(a);t&&!B&&(b=ha(b),E=b.y,L=b.x,a.find(".fp-slides").length&&m.abs(M-L)>m.abs(F-E)?m.abs(M-L)>l.width()/100*c.touchSensitivity&&(M>L?w.right&&e.moveSlideRight():w.left&&e.moveSlideLeft()):c.autoScrolling&&m.abs(F-E)>l.height()/100*c.touchSensitivity&&(F>E?K("down",g):E>F&&K("up",g)))}}function ga(a,b){b=b||0;var g=d(a).parent();return b<c.normalScrollElementTouchThreshold&&g.is(c.normalScrollElements)?!0:b==c.normalScrollElementTouchThreshold?!1:ga(g,++b)}function W(a){return"undefined"===typeof a.pointerType||
"mouse"!=a.pointerType}function Ga(a){a=a.originalEvent;c.fitToSection&&x.stop();W(a)&&(a=ha(a),F=a.y,M=a.x)}function ia(a,b){for(var c=0,d=a.slice(m.max(a.length-b,1)),e=0;e<d.length;e++)c+=d[e];return m.ceil(c/b)}function C(a){var b=(new Date).getTime();if(c.autoScrolling){a=h.event||a;var g=a.wheelDelta||-a.deltaY||-a.detail,p=m.max(-1,m.min(1,g));149<D.length&&D.shift();D.push(m.abs(g));c.scrollBar&&(a.preventDefault?a.preventDefault():a.returnValue=!1);a=d(".fp-section.active");a=fa(a);g=b-ja;
ja=b;200<g&&(D=[]);t&&(b=ia(D,10),g=ia(D,70),b>=g&&(0>p?K("down",a):K("up",a)));return!1}c.fitToSection&&x.stop()}function ka(a){var b=d(".fp-section.active").find(".fp-slides");if(b.length&&!B){var g=b.find(".fp-slide.active"),p=null,p="prev"===a?g.prev(".fp-slide"):g.next(".fp-slide");if(!p.length){if(!c.loopHorizontal)return;p="prev"===a?g.siblings(":last"):g.siblings(":first")}B=!0;G(b,p)}}function la(){d(".fp-slide.active").each(function(){X(d(this))})}function u(a,b,g){var p=a.position();if("undefined"!==
typeof p&&(b={element:a,callback:b,isMovementUp:g,dest:p,dtop:p.top,yMovement:U(a),anchorLink:a.data("anchor"),sectionIndex:a.index(".fp-section"),activeSlide:a.find(".fp-slide.active"),activeSection:d(".fp-section.active"),leavingSection:d(".fp-section.active").index(".fp-section")+1,localIsResizing:v},!(b.activeSection.is(a)&&!v||c.scrollBar&&l.scrollTop()===b.dtop))){if(b.activeSlide.length)var e=b.activeSlide.data("anchor"),f=b.activeSlide.index();c.autoScrolling&&c.continuousVertical&&"undefined"!==
typeof b.isMovementUp&&(!b.isMovementUp&&"up"==b.yMovement||b.isMovementUp&&"down"==b.yMovement)&&(b.isMovementUp?d(".fp-section.active").before(b.activeSection.nextAll(".fp-section")):d(".fp-section.active").after(b.activeSection.prevAll(".fp-section").get().reverse()),y(d(".fp-section.active").position().top),la(),b.wrapAroundElements=b.activeSection,b.dest=b.element.position(),b.dtop=b.dest.top,b.yMovement=U(b.element));a.addClass("active").siblings().removeClass("active");t=!1;V(f,e,b.anchorLink,
b.sectionIndex);d.isFunction(c.onLeave)&&!b.localIsResizing&&c.onLeave.call(b.activeSection,b.leavingSection,b.sectionIndex+1,b.yMovement);Ha(b);A=b.anchorLink;J(b.anchorLink,b.sectionIndex)}}function Ha(a){if(c.css3&&c.autoScrolling&&!c.scrollBar)ma("translate3d(0px, -"+a.dtop+"px, 0px)",!0),setTimeout(function(){na(a)},c.scrollingSpeed);else{var b=Ia(a);d(b.element).animate(b.options,c.scrollingSpeed,c.easing).promise().done(function(){na(a)})}}function Ia(a){var b={};c.autoScrolling&&!c.scrollBar?
(b.options={top:-a.dtop},b.element=".fullpage-wrapper"):(b.options={scrollTop:a.dtop},b.element="html, body");return b}function Ja(a){a.wrapAroundElements&&a.wrapAroundElements.length&&(a.isMovementUp?d(".fp-section:first").before(a.wrapAroundElements):d(".fp-section:last").after(a.wrapAroundElements),y(d(".fp-section.active").position().top),la())}function na(a){Ja(a);d.isFunction(c.afterLoad)&&!a.localIsResizing&&c.afterLoad.call(a.element,a.anchorLink,a.sectionIndex+1);t=!0;setTimeout(function(){d.isFunction(a.callback)&&
a.callback.call(this)},600)}function oa(){if(!T){var a=h.location.hash.replace("#","").split("/"),b=a[0],a=a[1];if(b.length){var c="undefined"===typeof A,d="undefined"===typeof A&&"undefined"===typeof a&&!B;(b&&b!==A&&!c||d||!B&&Y!=a)&&Z(b,a)}}}function Ka(a){t&&(a.pageY<N?e.moveSectionUp():a.pageY>N&&e.moveSectionDown());N=a.pageY}function G(a,b){var g=b.position(),e=b.index(),f=a.closest(".fp-section"),h=f.index(".fp-section"),k=f.data("anchor"),l=f.find(".fp-slidesNav"),m=pa(b),n=v;if(c.onSlideLeave){var q=
f.find(".fp-slide.active"),r=q.index(),t;t=r==e?"none":r>e?"left":"right";n||"none"===t||d.isFunction(c.onSlideLeave)&&c.onSlideLeave.call(q,k,h+1,r,t)}b.addClass("active").siblings().removeClass("active");!c.loopHorizontal&&c.controlArrows&&(f.find(".fp-controlArrow.fp-prev").toggle(0!==e),f.find(".fp-controlArrow.fp-next").toggle(!b.is(":last-child")));f.hasClass("active")&&V(e,m,k,h);var u=function(){n||d.isFunction(c.afterSlideLoad)&&c.afterSlideLoad.call(b,k,h+1,m,e);B=!1};c.css3?(g="translate3d(-"+
g.left+"px, 0px, 0px)",qa(a.find(".fp-slidesContainer"),0<c.scrollingSpeed).css(ra(g)),setTimeout(function(){u()},c.scrollingSpeed,c.easing)):a.animate({scrollLeft:g.left},c.scrollingSpeed,c.easing,function(){u()});l.find(".active").removeClass("active");l.find("li").eq(e).find("a").addClass("active")}function sa(){ta();if(O){var a=d(k.activeElement);a.is("textarea")||a.is("input")||a.is("select")||(a=l.height(),m.abs(a-aa)>20*m.max(aa,a)/100&&(e.reBuild(!0),aa=a))}else clearTimeout(ua),ua=setTimeout(function(){e.reBuild(!0)},
500)}function ta(){if(c.responsive){var a=f.hasClass("fp-responsive");l.width()<c.responsive?a||(e.setAutoScrolling(!1,"internal"),e.setFitToSection(!1,"internal"),d("#fp-nav").hide(),f.addClass("fp-responsive")):a&&(e.setAutoScrolling(P.autoScrolling,"internal"),e.setFitToSection(P.autoScrolling,"internal"),d("#fp-nav").show(),f.removeClass("fp-responsive"))}}function qa(a){var b="all "+c.scrollingSpeed+"ms "+c.easingcss3;a.removeClass("fp-notransition");return a.css({"-webkit-transition":b,transition:b})}
function La(a,b){if(825>a||900>b){var c=m.min(100*a/825,100*b/900).toFixed(2);q.css("font-size",c+"%")}else q.css("font-size","100%")}function J(a,b){c.menu&&(d(c.menu).find(".active").removeClass("active"),d(c.menu).find('[data-menuanchor="'+a+'"]').addClass("active"));c.navigation&&(d("#fp-nav").find(".active").removeClass("active"),a?d("#fp-nav").find('a[href="#'+a+'"]').addClass("active"):d("#fp-nav").find("li").eq(b).find("a").addClass("active"))}function U(a){var b=d(".fp-section.active").index(".fp-section");
a=a.index(".fp-section");return b==a?"none":b>a?"up":"down"}function I(a){a.css("overflow","hidden");var b=a.closest(".fp-section"),d=a.find(".fp-scrollable"),e;d.length?e=d.get(0).scrollHeight:(e=a.get(0).scrollHeight,c.verticalCentered&&(e=a.find(".fp-tableCell").get(0).scrollHeight));b=r-parseInt(b.css("padding-bottom"))-parseInt(b.css("padding-top"));e>b?d.length?d.css("height",b+"px").parent().css("height",b+"px"):(c.verticalCentered?a.find(".fp-tableCell").wrapInner('<div class="fp-scrollable" />'):
a.wrapInner('<div class="fp-scrollable" />'),a.find(".fp-scrollable").slimScroll({allowPageScroll:!0,height:b+"px",size:"10px",alwaysVisible:!0})):va(a);a.css("overflow","")}function va(a){a.find(".fp-scrollable").children().first().unwrap().unwrap();a.find(".slimScrollBar").remove();a.find(".slimScrollRail").remove()}function wa(a){a.addClass("fp-table").wrapInner('<div class="fp-tableCell" style="height:'+xa(a)+'px;" />')}function xa(a){var b=r;if(c.paddingTop||c.paddingBottom)b=a,b.hasClass("fp-section")||
(b=a.closest(".fp-section")),a=parseInt(b.css("padding-top"))+parseInt(b.css("padding-bottom")),b=r-a;return b}function ma(a,b){b?qa(f):f.addClass("fp-notransition");f.css(ra(a));setTimeout(function(){f.removeClass("fp-notransition")},10)}function Z(a,b){var c;"undefined"===typeof b&&(b=0);c=isNaN(a)?d('[data-anchor="'+a+'"]'):d(".fp-section").eq(a-1);a===A||c.hasClass("active")?ya(c,b):u(c,function(){ya(c,b)})}function ya(a,b){if("undefined"!=typeof b){var c=a.find(".fp-slides"),d=c.find('[data-anchor="'+
b+'"]');d.length||(d=c.find(".fp-slide").eq(b));d.length&&G(c,d)}}function Ma(a,b){a.append('<div class="fp-slidesNav"><ul></ul></div>');var d=a.find(".fp-slidesNav");d.addClass(c.slidesNavPosition);for(var e=0;e<b;e++)d.find("ul").append('<li><a href="#"><span></span></a></li>');d.css("margin-left","-"+d.width()/2+"px");d.find("li").first().find("a").addClass("active")}function V(a,b,d,e){e="";c.anchors.length&&(a?("undefined"!==typeof d&&(e=d),"undefined"===typeof b&&(b=a),Y=b,za(e+"/"+b)):("undefined"!==
typeof a&&(Y=b),za(d)));Aa()}function za(a){if(c.recordHistory)location.hash=a;else if(O||Q)history.replaceState(H,H,"#"+a);else{var b=h.location.href.split("#")[0];h.location.replace(b+"#"+a)}}function pa(a){var b=a.data("anchor");a=a.index(".fp-slide");"undefined"===typeof b&&(b=a);return b}function Aa(){var a=d(".fp-section.active"),b=a.find(".fp-slide.active"),e=a.data("anchor"),f=pa(b),a=a.index(".fp-section"),a=String(a);c.anchors.length&&(a=e);b.length&&(a=a+"-"+f);a=a.replace("/","-").replace("#",
"");q[0].className=q[0].className.replace(RegExp("\\b\\s?fp-viewing-[^\\s]+\\b","g"),"");q.addClass("fp-viewing-"+a)}function Na(){var a=k.createElement("p"),b,c={webkitTransform:"-webkit-transform",OTransform:"-o-transform",msTransform:"-ms-transform",MozTransform:"-moz-transform",transform:"transform"};k.body.insertBefore(a,null);for(var d in c)a.style[d]!==H&&(a.style[d]="translate3d(1px,1px,1px)",b=h.getComputedStyle(a).getPropertyValue(c[d]));k.body.removeChild(a);return b!==H&&0<b.length&&"none"!==
b}function Oa(){if(O||Q){var a=Ba();n.off("touchstart "+a.down).on("touchstart "+a.down,Ga);n.off("touchmove "+a.move).on("touchmove "+a.move,Fa)}}function Pa(){if(O||Q){var a=Ba();n.off("touchstart "+a.down);n.off("touchmove "+a.move)}}function Ba(){return h.PointerEvent?{down:"pointerdown",move:"pointermove"}:{down:"MSPointerDown",move:"MSPointerMove"}}function ha(a){var b=[];b.y="undefined"!==typeof a.pageY&&(a.pageY||a.pageX)?a.pageY:a.touches[0].pageY;b.x="undefined"!==typeof a.pageX&&(a.pageY||
a.pageX)?a.pageX:a.touches[0].pageX;Q&&W(a)&&(b.y=a.touches[0].pageY,b.x=a.touches[0].pageX);return b}function X(a){e.setScrollingSpeed(0,"internal");G(a.closest(".fp-slides"),a);e.setScrollingSpeed(P.scrollingSpeed,"internal")}function y(a){c.scrollBar?f.scrollTop(a):c.css3?ma("translate3d(0px, -"+a+"px, 0px)",!1):f.css("top",-a)}function ra(a){return{"-webkit-transform":a,"-moz-transform":a,"-ms-transform":a,transform:a}}function Qa(){y(0);d("#fp-nav, .fp-slidesNav, .fp-controlArrow").remove();
d(".fp-section").css({height:"","background-color":"",padding:""});d(".fp-slide").css({width:""});f.css({height:"",position:"","-ms-touch-action":"","touch-action":""});d(".fp-section, .fp-slide").each(function(){va(d(this));d(this).removeClass("fp-table active")});f.addClass("fp-notransition");f.find(".fp-tableCell, .fp-slidesContainer, .fp-slides").each(function(){d(this).replaceWith(this.childNodes)});x.scrollTop(0)}function R(a,b,d){c[a]=b;"internal"!==d&&(P[a]=b)}function S(a,b){console&&console[a]&&
console[a]("fullPage: "+b)}var x=d("html, body"),q=d("body"),e=d.fn.fullpage;c=d.extend({menu:!1,anchors:[],navigation:!1,navigationPosition:"right",navigationTooltips:[],showActiveTooltip:!1,slidesNavigation:!1,slidesNavPosition:"bottom",scrollBar:!1,css3:!0,scrollingSpeed:700,autoScrolling:!0,fitToSection:!0,easing:"easeInOutCubic",easingcss3:"ease",loopBottom:!1,loopTop:!1,loopHorizontal:!0,continuousVertical:!1,normalScrollElements:null,scrollOverflow:!1,touchSensitivity:5,normalScrollElementTouchThreshold:5,
keyboardScrolling:!0,animateAnchor:!0,recordHistory:!0,controlArrows:!0,controlArrowColor:"#fff",verticalCentered:!0,resize:!1,sectionsColor:[],paddingTop:0,paddingBottom:0,fixedElements:null,responsive:0,sectionSelector:".section",slideSelector:".slide",afterLoad:null,onLeave:null,afterRender:null,afterResize:null,afterReBuild:null,afterSlideLoad:null,onSlideLeave:null},c);(function(){c.continuousVertical&&(c.loopTop||c.loopBottom)&&(c.continuousVertical=!1,S("warn","Option `loopTop/loopBottom` is mutually exclusive with `continuousVertical`; `continuousVertical` disabled"));
c.continuousVertical&&c.scrollBar&&(c.continuousVertical=!1,S("warn","Option `scrollBar` is mutually exclusive with `continuousVertical`; `continuousVertical` disabled"));d.each(c.anchors,function(a,b){(d("#"+b).length||d('[name="'+b+'"]').length)&&S("error","data-anchor tags can not have the same value as any `id` element on the site (or `name` element for IE).")})})();d.extend(d.easing,{easeInOutCubic:function(a,b,c,d,e){return 1>(b/=e/2)?d/2*b*b*b+c:d/2*((b-=2)*b*b+2)+c}});d.extend(d.easing,{easeInQuart:function(a,
b,c,d,e){return d*(b/=e)*b*b*b+c}});e.setAutoScrolling=function(a,b){R("autoScrolling",a,b);var g=d(".fp-section.active");c.autoScrolling&&!c.scrollBar?(x.css({overflow:"hidden",height:"100%"}),e.setRecordHistory(c.recordHistory,"internal"),f.css({"-ms-touch-action":"none","touch-action":"none"}),g.length&&y(g.position().top)):(x.css({overflow:"visible",height:"initial"}),e.setRecordHistory(!1,"internal"),f.css({"-ms-touch-action":"","touch-action":""}),y(0),g.length&&x.scrollTop(g.position().top))};
e.setRecordHistory=function(a,b){R("recordHistory",a,b)};e.setScrollingSpeed=function(a,b){R("scrollingSpeed",a,b)};e.setFitToSection=function(a,b){R("fitToSection",a,b)};e.setMouseWheelScrolling=function(a){a?k.addEventListener?(k.addEventListener("mousewheel",C,!1),k.addEventListener("wheel",C,!1)):k.attachEvent("onmousewheel",C):k.addEventListener?(k.removeEventListener("mousewheel",C,!1),k.removeEventListener("wheel",C,!1)):k.detachEvent("onmousewheel",C)};e.setAllowScrolling=function(a,b){"undefined"!=
typeof b?(b=b.replace(" ","").split(","),d.each(b,function(b,c){switch(c){case "up":w.up=a;break;case "down":w.down=a;break;case "left":w.left=a;break;case "right":w.right=a;break;case "all":e.setAllowScrolling(a)}})):a?(e.setMouseWheelScrolling(!0),Oa()):(e.setMouseWheelScrolling(!1),Pa())};e.setKeyboardScrolling=function(a){c.keyboardScrolling=a};e.moveSectionUp=function(){var a=d(".fp-section.active").prev(".fp-section");a.length||!c.loopTop&&!c.continuousVertical||(a=d(".fp-section").last());
a.length&&u(a,null,!0)};e.moveSectionDown=function(){var a=d(".fp-section.active").next(".fp-section");a.length||!c.loopBottom&&!c.continuousVertical||(a=d(".fp-section").first());a.length&&u(a,null,!1)};e.moveTo=function(a,b){var c="",c=isNaN(a)?d('[data-anchor="'+a+'"]'):d(".fp-section").eq(a-1);"undefined"!==typeof b?Z(a,b):0<c.length&&u(c)};e.moveSlideRight=function(){ka("next")};e.moveSlideLeft=function(){ka("prev")};e.reBuild=function(a){if(!f.hasClass("fp-destroyed")){v=!0;var b=l.width();
r=l.height();c.resize&&La(r,b);d(".fp-section").each(function(){var a=d(this).find(".fp-slides"),b=d(this).find(".fp-slide");c.verticalCentered&&d(this).find(".fp-tableCell").css("height",xa(d(this))+"px");d(this).css("height",r+"px");c.scrollOverflow&&(b.length?b.each(function(){I(d(this))}):I(d(this)));b.length&&G(a,a.find(".fp-slide.active"))});b=d(".fp-section.active");b.index(".fp-section")&&u(b);v=!1;d.isFunction(c.afterResize)&&a&&c.afterResize.call(f);d.isFunction(c.afterReBuild)&&!a&&c.afterReBuild.call(f)}};
var B=!1,O=navigator.userAgent.match(/(iPhone|iPod|iPad|Android|playbook|silk|BlackBerry|BB10|Windows Phone|Tizen|Bada|webOS|IEMobile|Opera Mini)/),Q="ontouchstart"in h||0<navigator.msMaxTouchPoints||navigator.maxTouchPoints,f=d(this),r=l.height(),v=!1,A,Y,t=!0,D=[],z,w={up:!0,down:!0,left:!0,right:!0},P=d.extend(!0,{},c);e.setAllowScrolling(!0);f.removeClass("fp-destroyed");c.css3&&(c.css3=Na());d(this).length?(f.css({height:"100%",position:"relative"}),f.addClass("fullpage-wrapper")):S("error",
"Error! Fullpage.js needs to be initialized with a selector. For example: $('#myContainer').fullpage();");d(c.sectionSelector).each(function(){d(this).addClass("fp-section")});d(c.slideSelector).each(function(){d(this).addClass("fp-slide")});c.navigation&&Ea();d(".fp-section").each(function(a){var b=d(this),e=d(this).find(".fp-slide"),f=e.length;a||0!==d(".fp-section.active").length||d(this).addClass("active");d(this).css("height",r+"px");c.paddingTop&&d(this).css("padding-top",c.paddingTop);c.paddingBottom&&
d(this).css("padding-bottom",c.paddingBottom);"undefined"!==typeof c.sectionsColor[a]&&d(this).css("background-color",c.sectionsColor[a]);"undefined"!==typeof c.anchors[a]&&(d(this).attr("data-anchor",c.anchors[a]),d(this).hasClass("active")&&J(c.anchors[a],a));if(1<f){a=100*f;var h=100/f;e.wrapAll('<div class="fp-slidesContainer" />');e.parent().wrap('<div class="fp-slides" />');d(this).find(".fp-slidesContainer").css("width",a+"%");c.controlArrows&&Da(d(this));c.slidesNavigation&&Ma(d(this),f);
e.each(function(a){d(this).css("width",h+"%");c.verticalCentered&&wa(d(this))});b=b.find(".fp-slide.active");b.length?X(b):e.eq(0).addClass("active")}else c.verticalCentered&&wa(d(this))}).promise().done(function(){e.setAutoScrolling(c.autoScrolling,"internal");var a=d(".fp-section.active").find(".fp-slide.active");a.length&&(0!==d(".fp-section.active").index(".fp-section")||0===d(".fp-section.active").index(".fp-section")&&0!==a.index())&&X(a);c.fixedElements&&c.css3&&d(c.fixedElements).appendTo(q);
c.navigation&&(z.css("margin-top","-"+z.height()/2+"px"),z.find("li").eq(d(".fp-section.active").index(".fp-section")).find("a").addClass("active"));c.menu&&c.css3&&d(c.menu).closest(".fullpage-wrapper").length&&d(c.menu).appendTo(q);c.scrollOverflow?("complete"===k.readyState&&ba(),l.on("load",ba)):d.isFunction(c.afterRender)&&c.afterRender.call(f);ta();if(!c.animateAnchor&&(a=h.location.hash.replace("#","").split("/")[0],a.length)){var b=d('[data-anchor="'+a+'"]');b.length&&(c.autoScrolling?y(b.position().top):
(y(0),x.scrollTop(b.position().top)),J(a,null),d.isFunction(c.afterLoad)&&c.afterLoad.call(b,a,b.index(".fp-section")+1),b.addClass("active").siblings().removeClass("active"))}Aa();l.on("load",function(){var a=h.location.hash.replace("#","").split("/"),b=a[0],a=a[1];b&&Z(b,a)})});var da,ea,T=!1;l.on("scroll",ca);var F=0,M=0,E=0,L=0,ja=(new Date).getTime();l.on("hashchange",oa);n.keydown(function(a){clearTimeout(Ca);var b=d(k.activeElement);b.is("textarea")||b.is("input")||b.is("select")||!c.keyboardScrolling||
!c.autoScrolling||(-1<d.inArray(a.which,[40,38,32,33,34])&&a.preventDefault(),Ca=setTimeout(function(){var b=a.shiftKey;switch(a.which){case 38:case 33:e.moveSectionUp();break;case 32:if(b){e.moveSectionUp();break}case 40:case 34:e.moveSectionDown();break;case 36:e.moveTo(1);break;case 35:e.moveTo(d(".fp-section").length);break;case 37:e.moveSlideLeft();break;case 39:e.moveSlideRight()}},150))});var Ca;f.mousedown(function(a){2==a.which&&(N=a.pageY,f.on("mousemove",Ka))});f.mouseup(function(a){2==
a.which&&f.off("mousemove")});var N=0;n.on("click touchstart","#fp-nav a",function(a){a.preventDefault();a=d(this).parent().index();u(d(".fp-section").eq(a))});n.on("click touchstart",".fp-slidesNav a",function(a){a.preventDefault();a=d(this).closest(".fp-section").find(".fp-slides");var b=a.find(".fp-slide").eq(d(this).closest("li").index());G(a,b)});c.normalScrollElements&&(n.on("mouseenter",c.normalScrollElements,function(){e.setMouseWheelScrolling(!1)}),n.on("mouseleave",c.normalScrollElements,
function(){e.setMouseWheelScrolling(!0)}));d(".fp-section").on("click touchstart",".fp-controlArrow",function(){d(this).hasClass("fp-prev")?e.moveSlideLeft():e.moveSlideRight()});l.resize(sa);var aa=r,ua;e.destroy=function(a){e.setAutoScrolling(!1,"internal");e.setAllowScrolling(!1);e.setKeyboardScrolling(!1);f.addClass("fp-destroyed");l.off("scroll",ca).off("hashchange",oa).off("resize",sa);n.off("click","#fp-nav a").off("mouseenter","#fp-nav li").off("mouseleave","#fp-nav li").off("click",".fp-slidesNav a").off("mouseover",
c.normalScrollElements).off("mouseout",c.normalScrollElements);d(".fp-section").off("click",".fp-controlArrow");a&&Qa()}}})(jQuery,window,document,Math);


/*! Copyright (c) 2013 Brandon Aaron (http://brandon.aaron.sh)
 * Licensed under the MIT License (LICENSE.txt).
 *
 * Version: 3.1.12
 *
 * Requires: jQuery 1.2.2+
 */
!function(a){"function"==typeof define&&define.amd?define(["jquery"],a):"object"==typeof exports?module.exports=a:a(jQuery)}(function(a){function b(b){var g=b||window.event,h=i.call(arguments,1),j=0,l=0,m=0,n=0,o=0,p=0;if(b=a.event.fix(g),b.type="mousewheel","detail"in g&&(m=-1*g.detail),"wheelDelta"in g&&(m=g.wheelDelta),"wheelDeltaY"in g&&(m=g.wheelDeltaY),"wheelDeltaX"in g&&(l=-1*g.wheelDeltaX),"axis"in g&&g.axis===g.HORIZONTAL_AXIS&&(l=-1*m,m=0),j=0===m?l:m,"deltaY"in g&&(m=-1*g.deltaY,j=m),"deltaX"in g&&(l=g.deltaX,0===m&&(j=-1*l)),0!==m||0!==l){if(1===g.deltaMode){var q=a.data(this,"mousewheel-line-height");j*=q,m*=q,l*=q}else if(2===g.deltaMode){var r=a.data(this,"mousewheel-page-height");j*=r,m*=r,l*=r}if(n=Math.max(Math.abs(m),Math.abs(l)),(!f||f>n)&&(f=n,d(g,n)&&(f/=40)),d(g,n)&&(j/=40,l/=40,m/=40),j=Math[j>=1?"floor":"ceil"](j/f),l=Math[l>=1?"floor":"ceil"](l/f),m=Math[m>=1?"floor":"ceil"](m/f),k.settings.normalizeOffset&&this.getBoundingClientRect){var s=this.getBoundingClientRect();o=b.clientX-s.left,p=b.clientY-s.top}return b.deltaX=l,b.deltaY=m,b.deltaFactor=f,b.offsetX=o,b.offsetY=p,b.deltaMode=0,h.unshift(b,j,l,m),e&&clearTimeout(e),e=setTimeout(c,200),(a.event.dispatch||a.event.handle).apply(this,h)}}function c(){f=null}function d(a,b){return k.settings.adjustOldDeltas&&"mousewheel"===a.type&&b%120===0}var e,f,g=["wheel","mousewheel","DOMMouseScroll","MozMousePixelScroll"],h="onwheel"in document||document.documentMode>=9?["wheel"]:["mousewheel","DomMouseScroll","MozMousePixelScroll"],i=Array.prototype.slice;if(a.event.fixHooks)for(var j=g.length;j;)a.event.fixHooks[g[--j]]=a.event.mouseHooks;var k=a.event.special.mousewheel={version:"3.1.12",setup:function(){if(this.addEventListener)for(var c=h.length;c;)this.addEventListener(h[--c],b,!1);else this.onmousewheel=b;a.data(this,"mousewheel-line-height",k.getLineHeight(this)),a.data(this,"mousewheel-page-height",k.getPageHeight(this))},teardown:function(){if(this.removeEventListener)for(var c=h.length;c;)this.removeEventListener(h[--c],b,!1);else this.onmousewheel=null;a.removeData(this,"mousewheel-line-height"),a.removeData(this,"mousewheel-page-height")},getLineHeight:function(b){var c=a(b),d=c["offsetParent"in a.fn?"offsetParent":"parent"]();return d.length||(d=a("body")),parseInt(d.css("fontSize"),10)||parseInt(c.css("fontSize"),10)||16},getPageHeight:function(b){return a(b).height()},settings:{adjustOldDeltas:!0,normalizeOffset:!0}};a.fn.extend({mousewheel:function(a){return a?this.bind("mousewheel",a):this.trigger("mousewheel")},unmousewheel:function(a){return this.unbind("mousewheel",a)}})});


/**
 * Jquery Inview 2
 * Version: 0.1
 * Author: Matthew Frey (mmmeff)
 *    - forked from http://github.com/protonet/jquery.inview/
 */
(function(e){function t(){var t=e();if(e.each(n,function(e,i){var n=i.data.selector,a=i.$element;t=t.add(n?a.find(n):a)}),t.length)for(var i=0;t.length>i;i++)if(t[i])if(e.contains(r,t[i])){var a=e(t[i]),c=a.data("inview"),l=a[0].getBoundingClientRect(),o=a.height(),h=a.width();l.top>=0-o&&l.left>=0-h&&l.bottom<=(d.innerHeight||r.clientHeight)+o&&l.right<=(d.innerWidth||r.clientWidth)+h?c||a.data("inview",!0).trigger("inview",[!0]):c&&a.data("inview",!1).trigger("inview",[!1])}else delete t[i]}var i,n={},a=document,d=window,r=a.documentElement,c=e.expando;e.event.special.inview={add:function(a){n[a.guid+"-"+this[c]]={data:a,$element:e(this)},i||e.isEmptyObject(n)||(i=setInterval(t,333))},remove:function(t){try{delete n[t.guid+"-"+this[c]]}catch(a){}e.isEmptyObject(n)&&(clearInterval(i),i=null)}}})(jQuery);


