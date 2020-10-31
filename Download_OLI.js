// AOI
// Load vector layer of TEI 337082-C 
var TEI = ee.FeatureCollection('users/nsrditec/IBAMA/02047-000693-2007-12/TEI_337082_C');

// Buffer 2 km
var sample = TEI.geometry();
var buf = sample.buffer(5000);

// Vector Vizualize Parameters
var pol = ee.Image().byte();
var visArea = pol.paint({
  featureCollection: TEI,
  color: 1,
  width: 2
});

// Cloud Mask
function fmask(img){
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;
  var qa = img.select('pixel_qa');
  var mask = qa.bitwiseAnd(cloudShadowBitMask)
                  .eq(0)
                  .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return img.updateMask(mask);
}

// LANDSAT 8 OLI Collection
var oli = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
  //.map(fmask)
  .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7'],
          ['Blue', 'Green', 'Red','NIR', 'SWIR1', 'SWIR2'])
  .filter(ee.Filter.eq('WRS_PATH', 225))
  .filter(ee.Filter.eq('WRS_ROW', 65))
  .filter(ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
  .filter(ee.Filter.lt('CLOUD_COVER', 20))
  .filter(ee.Filter.lt('GEOMETRIC_RMSE_MODEL', 10))
  .filter(ee.Filter.date('2016-06-01', '2016-06-30'));  

/* LANDSAT 8 OLI (TOA)
var oliToa = ee.ImageCollection('LANDSAT/LC08/C01/T1_TOA')
  //.select(['B4', 'B5', 'B6', 'B8'],['Red','NIR', 'SWIR1', 'Pan'])
  .filter(ee.Filter.eq('WRS_PATH', 224))
  .filter(ee.Filter.eq('WRS_ROW', 66))
  .filter(ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
  .filter(ee.Filter.lt('CLOUD_COVER', 20))
  .filter(ee.Filter.lt('GEOMETRIC_RMSE_MODEL', 10))
  .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
  .sort('system:time_start', false); */
  
// RGB visualize parameters
var visRGB = {
  bands:  /*['B5','B4','B3'],*/ ['SWIR1', 'NIR', 'Red'],
  min: 0,
  max: 30000,
  gamma: [1.6, 1.9, 1.9]
};

// Reduzir a coleção 
function median(img){
  return img.reduce(ee.Reducer.median());
}

var imgMed = median(oli);

// Get imgage information
print(oli.getInfo());
//print(oliToa.getInfo());

/* Fusão com a banda pan
var pan = function(img){
  var rgb = img.select(['B6', 'B5', 'B4']);
  var gray = img.select('B8');
  var hueSat = rgb.rgbToHsv().select('hue', 'saturation');
  return ee.image.cat(hueSat, gray).hsvToRgb();
};

var oliPan = pan(oliToa);*/

// Display image on the map.
Map.addLayer(oli, visRGB, 'OLI_Cor');

// Export to Google Drive
Export.image.toDrive({
  image: oli.first(),
  description: 'LC08_225065_20160615',
  scale: 30,
  region: buf, 
  folder: 'img',
  //crs: 'EPSG:32722'
});

// Display AOI on the map.
Map.centerObject(TEI, 14);
Map.addLayer(visArea, {color: 'f8766d'}, 'FAZ');
Map.setOptions('HYBRID');