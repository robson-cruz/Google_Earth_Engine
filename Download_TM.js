// AOI
// Load vector layer
var TEI = ee.FeatureCollection('users/.....'); // enter the vector file path in single quotes

// Buffer 2 km
var sample = TEI.geometry();
var buf = sample.buffer(3000);

// Vector Vizualize Parameters
var pol = ee.Image().byte();
var visArea = pol.paint({
  featureCollection: TEI,
  color: 1,
  width: 2
});
// Cloud Mask ETM+
var cloudMask7 = function(img){
  var qa = img.select('pixel_qa');
  var cloud = qa.bitwiseAnd(1 << 5)
                    .and(qa.bitwiseAnd(1 << 7))
                    .or(qa.bitwiseAnd(1 << 3));
  var mask2 = img.mask().reduce(ee.Reducer.min());
  return img.updateMask(cloud.not()).updateMask(mask2);
};

// LANDSAT 7 ETM+ Collection
var l7 = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
  .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'sr_atmos_opacity', 'sr_cloud_qa', 'pixel_qa', 'radsat_qa'],
          ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'TIR', 'SWIR2', 'sr_atmos_opacity', 'sr_cloud_qa', 'pixel_qa', 'radsat_qa'])
  .map(cloudMask7);

var kernelSize = 10;
var kernel = ee.Kernel.square(kernelSize * 30, 'meters', false);

var gapFill = function(img){
  var start = img.date().advance(-1, 'year');
  var end = img.date().advance(1, 'year');
  var fill = l7.filterDate(start, end).median();
  var regress = fill.addBands(img);
  regress = regress.select(regress.bandNames().sort());
  var fit = regress.reduceNeighborhood(ee.Reducer.linearFit()
                    .forEach(img.bandNames()), kernel, null, false);
  var offset = fit.select('.*_offset');
  var scale = fit.select('.*_scale');
  var scaled = fill.multiply(scale).add(offset);
  return img.unmask(scaled, true);
};

var etmFilter = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
  .filterBounds(TEI)
  .filterDate('2005-09-01', '2005-09-30')
  .filter(ee.Filter.eq('WRS_PATH', 225))
  .filter(ee.Filter.eq('WRS_ROW', 65))
  .filter(ee.Filter.eq('IMAGE_QUALITY', 9))
  .filter(ee.Filter.lt('CLOUD_COVER', 15))
  .filter(ee.Filter.lt('GEOMETRIC_RMSE_MODEL', 10));

var etmFirst = ee.Image(etmFilter.first());
var checkStart = etmFirst.date().advance(-1, 'year');
var checkEnd = etmFirst.date().advance(1, 'year');
var etm = l7.filterDate(checkStart, checkEnd).median();

// RGB visualize parameters
var visRGB = {
  bands:  /*['B5','B4','B3'],*/ ['SWIR1', 'NIR', 'Red'],
  min: 10,
  max: 30000,
  gamma: [1.8, 1.7, 1.9]
};


// RReduce collection by median filter
function median(img){
  return img.reduce(ee.Reducer.median());
}

var imgMed = median(etm);

print(etmFilter.getInfo());

// Display image on the map.
Map.addLayer(etm, visRGB, 'ETM_Cor');
//Map.addLayer(img.Med(), visRGB, 'TM_Cor');

// Export to Google Drive
Export.image.toDrive({
  image: etm,
  description: 'LE07_225065_20030823',
  scale: 30,
  region: buf, 
  folder: 'img',
  //crs: 'EPSG:32722'
});

// Display AOI on the map.
Map.centerObject(TEI, 12);
Map.addLayer(visArea, {color: 'f8766d'}, 'TEI');
Map.setOptions('HYBRID');
