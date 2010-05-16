
// Shorthand
if (typeof(Cc) == "undefined")
  var Cc = Components.classes;
if (typeof(Ci) == "undefined")
  var Ci = Components.interfaces;
if (typeof(Cu) == "undefined")
  var Cu = Components.utils;
if (typeof(Cr) == "undefined")
  var Cr = Components.results;
  
Cu.import("resource://app/jsmodules/sbProperties.jsm");


/**
 * Media Page Controller
 *
 * In order to display the contents of a library or list, pages
 * must provide a "window.mediaPage" object implementing
 * the Songbird sbIMediaPage interface. This interface allows
 * the rest of Songbird to talk to the page without knowledge 
 * of what the page looks like.
 *
 * In this particular page most functionality is simply 
 * delegated to the sb-playlist widget.
 */
window.mediaPage = {
    
    // The sbIMediaListView that this page is to display
  _mediaListView: null,
  
  analysis: null,
    
  
  /** 
   * Gets the sbIMediaListView that this page is displaying
   */
  get mediaListView()  {
    return this._mediaListView;
  },
  
  JSON: Cc['@mozilla.org/dom/json;1'].createInstance(Ci.nsIJSON),
  
  handleSearchResponse:  function (response) {
    // get a JS object 
    var responseObj = this.JSON.decode(response);
    var analysis_url = responseObj["response"]["songs"][0]["tracks"][0]["analysis_url"];
    alert(analysis_url);
    
    // pull analysis from given url.
    var self = this;
    this.callAPI(analysis_url, function(response)
    {
        var track = self.JSON.decode(response);
        self.analysis = new TrackInfo(track);
    });
    
  },
  
  /** 
   * Set the sbIMediaListView that this page is to display.
   * Called in the capturing phase of window load by the Songbird browser.
   * Note that to simplify page creation mediaListView may only be set once.
   */
  set mediaListView(value)  {
    
    if (!this._mediaListView) {
      this._mediaListView = value;
    } else {
      throw new Error("mediaListView may only be set once.  Please reload the page");
    }
  },
    
  get_md5: function(file) 
  {
      var fiStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      fiStream.init(file, 0x01, 0666, 0); // fuck yeah
      var ch = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
      ch.init(ch.MD5);
      // this tells updateFromStream to read the entire file
      const PR_UINT32_MAX = 0xffffffff;
      ch.updateFromStream(fiStream, PR_UINT32_MAX);
      // pass false here to get binary data back
      var hash = ch.finish(false);
      // return the two-digit hexadecimal code for a byte
      function toHexString(charCode)
      {
          return ("0" + charCode.toString(16)).slice(-2);
      }
      
      // convert the binary hash data to a hex string.
      var s = [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
      return s;
  },
  
  callAPI: function(url, callback) 
  {
      var req = Cc['@mozilla.org/xmlextras/xmlhttprequest;1'].createInstance(Ci.nsIXMLHttpRequest);
      req.open('GET',url,true);
      req.onreadystatechange = function(e) 
      {
          if (req.readyState == 4) 
          {
              if (req.status == 200)
                  callback(req.responseText);
              else
                Cu.reportError("api xmlhttprequest error");
          }   
      };  
      req.send(null);
  },
  
  getAnalysis: function(md5, artist, title)
  {
      artist  = artist.replace(/ /g, '%20'); // URL ENCODE FTW
      title = title.replace(/ /g, '%20'); // URL ENCODE FTW
      
      // Skip md5 for now; it takes time, and we can't do a proper lookup.
    
    var url = "http://beta.developer.echonest.com/api/v4/song/search?api_key=HSHR3EZROVIQJYY43&format=json" +
    "&results=1&artist=" + artist + "&title=" + title +
    "&bucket=tracks&bucket=audio_summary&bucket=id:paulify&bucket=id:playme";
    
     var self = this;
     this.callAPI(url, function(response) { self.handleSearchResponse(response);});
    

  },
  /** 
   * Called when the page finishes loading.  
   * By this time window.mediaPage.mediaListView should have 
   * been externally set.  
   */
  onLoad: function(e) {
    
    // Make sure we have the javascript modules we're going to use
    if (!window.SBProperties) 
      Cu.import("resource://app/jsmodules/sbProperties.jsm");
    if (!window.LibraryUtils) 
      Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
    if (!window.kPlaylistCommands) 
      Cu.import("resource://app/jsmodules/kPlaylistCommands.jsm");
    
    if (!this._mediaListView) 
    {
        Components.utils.reportError("Media Page did not receive a mediaListView before the onload event!");
        return;
    } 
        
    //
    // TODO: Do something interesting here!
    //
    
    // Listen to changes in the position dataremote.
    var alertCount = 0;
    var self = this;
    var positionObserver = {
      observe : function(subject, topic, position) 
      {
          if (self.analysis)
          {
              // have position in ms, update processing?
          }
          // else nothing to be done. Paint a picture of an hourglass?
      }
    };
    
    var positionRemote = Cc["@songbirdnest.com/Songbird/DataRemote;1"].createInstance(Ci.sbIDataRemote);
    positionRemote.init("metadata.position");
    positionRemote.bindObserver(positionObserver, true);
    
        
    var selection = this._mediaListView.selection;
    var seedTrack = selection.currentMediaItem; // sbiMediaItem
    if (!seedTrack || selection.count == 0) 
    {
        alert("One track at a time, please");
    }
    
    //var path = seedTrack.contentSrc.path;
    var spec = seedTrack.getProperty(SBProperties.contentURL);
    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var filehandler = ios.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    var file = filehandler.getFileFromURLSpec(spec);
    var md5 = this.get_md5(file);
    
    var artist = seedTrack.getProperty(SBProperties.artistName)
    var track = seedTrack.getProperty(SBProperties.trackName)
    
    var analysis = this.getAnalysis(md5, artist, track);
    
    // Get playlist commands (context menu, keyboard shortcuts, toolbar)
    // Note: playlist commands currently depend on the playlist widget.
    var mgr =
      Components.classes["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
                .createInstance(Components.interfaces.sbIPlaylistCommandsManager);
    var cmds = mgr.request(kPlaylistCommands.MEDIAITEM_DEFAULT);
    
  },
    
    
  /** 
   * Called as the window is about to unload
   */
  onUnload:  function(e) {
  },
    
  
  /** 
   * Show/highlight the MediaItem at the given MediaListView index.
   * Called by the Find Current Track button.
   */
  highlightItem: function(aIndex) {
  },
    
  
  /** 
   * Called when something is dragged over the tabbrowser tab for this window
   */
  canDrop: function(aEvent, aSession) {

  },
    
  
  /** 
   * Called when something is dropped on the tabbrowser tab for this window
   */
  onDrop: function(aEvent, aSession) {
  },
  
  setupProcessing: function(canvas){
      var p = Processing(canvas);
      p.setup         = function() { self.setup(p); };
      p.draw          = function() { self.draw(p); };
      p.mousePressed  = function() { self.mousePressed(p); };
      p.mouseReleased = function() { self.mouseReleased(p); };
      p.mouseDragged  = function() { self.mouseDragged(p); };
      p.init();    
  },
} // End window.mediaPage 


