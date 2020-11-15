/*
*********************************************************************************
                       Timelapse de Série Temporal Landsat 
*********************************************************************************
*/

// Carregar o polígono da Área de Interesse.
var faz = ee.FeatureCollection('users/nsrditec/Faz_Itaipavas_PRAD/Farm');

// Retângulo para o GIF
var rec = ee.Geometry.Rectangle({
                coords: [[-49.2160, -6.4787], [-48.9306, -6.6852]],
                geodesic: false,
});

// Parâmetros de visualização do polígono.
var pol = ee.Image().byte();
var visArea = pol.paint({
                featureCollection: faz,
                color: 1,
                width: 2
});

// Função para recortar as imagens em função do polígono.
function clipImg(img){
                return img.clipToCollection(faz);
}

// Carregar as coleções do Landsat
// 5TM (Jan 1, 1984 - May 5, 2012).
var TM = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
                // Classifica em ordem crescente a coleção pela data
                .sort('system_time:start', true)
                // Seleciona as bandas de interesse
                .select(['B5','B4','B3'],['SWIR1', 'NIR', 'Red']);

// 7ETM+ (Jan 1, 1999 - Dec 28, 2019).
var ETM = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
                // Classifica em ordem crescente a coleção pela data
                .sort('system_time:start', true)
                // Seleciona as bandas de interesse
                .select(['B5','B4','B3'],['SWIR1', 'NIR', 'Red']);

// 8OLI (Apr 11, 2013 - 2020).
var OLI = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
                // Classifica em ordem crescente a coleção pela data
                .sort('system_time:start', true)
                // Seleciona as bandas de interesse
                .select(['B6','B5','B4'],['SWIR1', 'NIR', 'Red']);

// Flitro para o período da coleção.
var colFilter = ee.Filter.and(
                // Seleciona a órbita/ponto 223/65
                ee.Filter.eq('WRS_PATH', 223), 
                ee.Filter.eq('WRS_ROW', 65),
                // Seleciona o perío do da série temporal
                ee.Filter.date('1984-07-01','2019-12-30'),
                // Seleciona cenas com cobertura máxima de nuvem abaixo de 15%
                ee.Filter.lt('CLOUD_COVER', 15),
                // Seleciona cenas com erro médio quadrático menor que 10m
                ee.Filter.lt('GEOMETRIC_RMSE_MODEL', 10),
                ee.Filter.or(
                  // Seleciona cenas com a máxima qualidade para as coleções dos satélites Landsat
                  ee.Filter.eq('IMAGE_QUALITY', 9),
                  ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
);

// Fusão das Coleções para gerar uma série temporal.
var serieTemp = ee.ImageCollection(TM.merge(OLI))
                .filter(colFilter).map(clipImg);

// Mostra os metadados da coleção. 
var n_IMG = serieTemp.getInfo();
print('Número de Cenas para o Período:', n_IMG);

// Calcula mediana nos pixels que intersectam a AOI para cada cena na coleção,
// e adiciona o nova valor nas  propriedades das cenas.
var medianCol = serieTemp.map(function(img){
                var imgReduce = img.reduceRegion({
                  reducer: ee.Reducer.median(),
                  geometry: rec,
                  scale: 30,
                  bestEffort: true,
                  maxPixels: 1e9
                });
                return img.copyProperties(img, ['system:time_start', 'bandsNames']);
});

// Reduz a coleção através de um filtro de mediana intra anual.
var col = medianCol.map(function(img){
                return img.set('year', img.date().get('year'));
});

// Faz uma Subcoleção a partir das cenas com anos distintos, evita
// cenas com mesma datas entre os sensores TM e ETM+.
var distinctYearCol = col.distinct('year');

// Filtro que identifica as imagens a partir da
// coleção completa e que corresponde ao 'ano' da coleção do ano distinto (distintoYearCol).
var filter = ee.Filter.equals({
                leftField: 'year', 
                rightField: 'year'
              });

// Define um 'join'.
var join = ee.Join.saveAll('year_matches');

// Aplica o 'join' e converte o resultado da FeatureCollection para uma ImageCollection.
var joinCol = ee.ImageCollection(join.apply(distinctYearCol, col, filter));

// Aplica redução de mediana entre os anos da coleção.
var medianComp = joinCol.map(function(img) {
                var yearCol = ee.ImageCollection.fromImages(
                                img.get('year_matches'));
                return yearCol.reduce(ee.Reducer.median())
                                .set('system:time_start', img.date().update());
});

// Mostra os metadados da coleção após redução por mediana intra anual. 
var medianInf = medianComp.getInfo();
print('Número de Cenas após filtro de Mediana:', medianInf);

// Parâmetros de Visualização para as imagens.
var visST = medianComp.map(function(img){
                var stat = img
                  .select(['SWIR1_median', 'NIR_median', 'Red_median'])
                  .reduceRegion({
                    geometry: rec,
                    reducer: ee.Reducer.percentile([5,95]),
                    scale: 30,
                    maxPixels: 1e9
                });
                return img.visualize({
                                min: ee.List([stat.get('SWIR1_median_p5'), 
                                                stat.get('NIR_median_p5'), 
                                                stat.get('Red_median_p5')]),
                                max: ee.List([stat.get('SWIR1_median_p95'), 
                                                stat.get('NIR_median_p95'), 
                                                stat.get('Red_median_p95')])
                });
});

// Obtem-se a posição do texto das datas.
var text = require('users/nsrditec/template:text');
var posTxt = text.getLocation(rec, 'left', '10%', '15%');

// Parâmetros de Visualização para animação o GIF.
var visRgbTxt = visST.map(function(img){
                var scale = 100;
                var textVis = 
                {
                  fontSize: 18, 
                  textColor: 'ffffff', 
                  outlineColor: '000000', 
                  outlineWidth: 2.5, 
                  outlineOpacity: 0.6
                };
                var label = text.draw(ee.String(img.get('system:index')).slice(14,18), 
                  posTxt, scale, visRgbTxt);
                return img.blend(label);
});

// Parâmetros de Visualização para o GIF.
var visGif = {
                crs: 'EPSG:3857',  // Pseudo Mercator
                dimensions: '640', // 640, 1080
                format: 'gif',
                region: rec,
                framesPerSecond: 1,
};

var parGif = ui.Thumbnail({
                image: visRgbTxt,
                params: visGif,
                style: {
                  position: 'bottom-right'
                }
});

// Mostrar o GIF e o Mosaico na tela.
Map.centerObject(faz, 10); // Centraliza o polígono na tela do mapa
Map.addLayer(visST); // Adiciona no mapa um mosaico com a última cena
//print(visRgbTxt.getVideoThumbURL(visGif)); // Mostra o link do GIF no console
Map.add(parGif); // Mostra o GIF no mapa
Map.addLayer(visArea); // Adiciona o polígo da TI no mapa
//Map.addLayer(rec, {});
