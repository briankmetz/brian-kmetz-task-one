import { Component, Injectable, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import US_Outline from '../assets/geo/us_outline_5m.json';
import US_States from '../assets/geo/us_states_5m.json';
import US_Counties from '../assets/geo/us_counties_5m.json';
import US_Congressional from '../assets/geo/us_congressional_5m.json';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

// Should make seperate components and services for the map, overlays, API calls, popups, etc.
// But, as this is a small project, everything can just be handled here for simplicity
export class AppComponent implements AfterViewInit{
  
  constructor(private http: HttpClient) {
    //console.log(US_Outline.features[0]);
    //console.log(US_States.features[0]);
    //console.log(US_Counties.features[0]);
    //console.log(US_Congressional.features[0]);
  }

  ngAfterViewInit() {
    
    // prepare for making API calls
    var http_client = this.http;
    var base_url = 'https://api.census.gov/data/2013/language?get=LAN7,LANLABEL&EST=0:1000000000'
    var injectApiData = function(popup, feature) {
      // generate url depending on if this feature is a state or county
      let url;
      if(feature.properties.COUNTY)
        url = base_url + '&for=county:' + feature.properties.COUNTY + '&in=state:' + feature.properties.STATE
      else
        url = base_url + '&for=state:' + feature.properties.STATE
      
      // make API call and then inject popup content
      http_client.get(url)
        .subscribe((data: any[]) => {
          if(!data){
            popup.setContent('<h1>'+feature.properties.NAME+'</h1><p><b>Data Unavailable</b><br>This likely occured because tabulations are only kept for counties with 100,000 or more total population and 25,000 or more speakers of languages other than English and Spanish.</p>')
            return;
          }
          // name of state or county
          var popupContent = '<h1>'+feature.properties.NAME+'</h1><p>'
          
          // hardcoding the indicies would probably be fine but just in case the columns returns in an unexpected order...
          var labelIndex = data[0].indexOf('LANLABEL');
          var populationIndex = data[0].indexOf('EST');
          
          // add each LAN7 result to the popup html
          for(var i = 1; i < data.length; i++){
            popupContent += '<b>'+data[i][labelIndex]+':</b> '+data[i][populationIndex]+'<br>'
          }
          popupContent += '</p>'
          
          // push to the popup
          popup.setContent(popupContent)
        })
    }
    
    // initialize map object centered on the US
    const myMap = L.map('map').setView([39.8282, -98.5795], 4);
    
    // create base layer using omniscale (free API key valid until 12-22-19)
    var host = 'https://maps.omniscale.net/v2/{id}/style.grayscale/{z}/{x}/{y}.png';
    var attribution = '&copy; 2019 &middot; <a href="https://maps.omniscale.com/">Omniscale</a> ' +
                      '&middot; Map data: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                      '&middot; This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.';
    L.tileLayer(host, {
      id: '39-degrees-task-a154e993',
      attribution: attribution
    }).addTo(myMap);
    myMap.attributionControl.setPrefix(false);
    
    // create seperate panes for the overlays to preserve their order at all time.
    // Messy workaround; a limitation with SVG prevents .setZIndex() from working
    // with .geoJSON as you might expect given that it inherits from LayerGroup
    myMap.createPane('outlinePane');
    myMap.getPane('outlinePane').style.zIndex = 404;
    myMap.createPane('invisibleCountiesPane');
    myMap.getPane('invisibleCountiesPane').style.zIndex = 403;
    myMap.createPane('statesPane');
    myMap.getPane('statesPane').style.zIndex = 402;
    myMap.createPane('countiesPane');
    myMap.getPane('countiesPane').style.zIndex = 401;
    myMap.createPane('congressionalPane');
    myMap.getPane('congressionalPane').style.zIndex = 400;
    
    // initialize overlays from the imported GeoJSON and bind popups to state and county features
    var outline = L.geoJSON(US_Outline, {
            pane: 'outlinePane',
            style: function(feature) {
                switch (feature.properties.TYPE) {
                    case 'COASTAL': return {color: "#000000", weight: 3.5};
                    case 'MEXICAN':   return {color: "#000000", weight: 3.5};
                    case 'CANADIAN':   return {color: "#000000", weight: 3.5};
                }
            }
        }),
        invisibleCounties = L.geoJSON(US_Counties, {
            pane: 'invisibleCountiesPane',
            onEachFeature: function (feature, layer) {
              layer.bindPopup();
              layer.on('popupopen', function (e) { // API call only made when popup is opened, not when it is instantiated
                injectApiData(e.popup, feature);
              })
            },
            style: {color: "rgba(0,0,0,0)"}
        }),
        states = L.geoJSON(US_States, {
            pane: 'statesPane',
            onEachFeature: function (feature, layer) {
              layer.bindPopup();
              layer.on('popupopen', function (e) { // API call only made when popup is opened, not when it is instantiated
                injectApiData(e.popup, feature);
              })
            },
            style: {color: "#333333"}
        }),
        counties = L.geoJSON(US_Counties, {
            pane: 'countiesPane',
            style: {color: "#800000", weight: 2.5, opacity: .35}
        }),
        congressional = L.geoJSON(US_Congressional, {
            pane: 'congressionalPane',
            style: {color: "#000080", weight: 2.5, opacity: .5}
        });
    
    // create control layer for switchable overlays
    L.control.layers(null, {
      "<img src='../assets/outline_icon.png' /> <span class='my-layer-item'> US Outline </span>": outline,
      "<img src='../assets/states_icon.png' /> <span class='my-layer-item'> States </span>": states,
      "<img src='../assets/counties_icon.png' /> <span class='my-layer-item'> Counties </span>": counties,
      "<img src='../assets/capitol_icon.png' /> <span class='my-layer-item'> Congressional Districts </span>": congressional
    }).addTo(myMap);
    L.control.scale().addTo(myMap);
    
    // to ensure the state outlines stay visible even when the country overview is enabled, the state
    // pane has a higher z-index than the county pane. However when counties and states are both visible,
    // county popups should take precedent over state popups. This is accomplished by creating an invisible
    // layer over the state layer than contains the clickable county popups 
    myMap.on('overlayadd', function (e) {
      if(e.layer.options.pane == 'countiesPane'){
        myMap.addLayer(invisibleCounties);
      }
    });
    myMap.on('overlayremove', function (e) {
      if(e.layer.options.pane == 'countiesPane'){
        myMap.removeLayer(invisibleCounties);
      }
    });
    
  }
}
