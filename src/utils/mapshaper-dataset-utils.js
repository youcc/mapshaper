/* @requires mapshaper-common, mapshaper-shape-utils, mapshaper-point-utils */

// utility functions for datasets and layers

// Divide a collection of features with mixed types into layers of a single type
// (Used for importing TopoJSON and GeoJSON features)
MapShaper.divideFeaturesByType = function(shapes, properties, types) {
  var typeSet = utils.uniq(types);
  var layers = typeSet.map(function(geoType) {
    var p = [],
        s = [],
        dataNulls = 0,
        rec;
    for (var i=0, n=shapes.length; i<n; i++) {
      if (types[i] != geoType) continue;
      if (geoType) s.push(shapes[i]);
      rec = properties[i];
      p.push(rec);
      if (!rec) dataNulls++;
    }
    return {
      geometry_type: geoType,
      shapes: s,
      data: dataNulls < s.length ? new DataTable(p) : null
    };
  });
  return layers;
};

// Split into datasets with one layer each
MapShaper.splitDataset = function(dataset) {
  return dataset.layers.map(function(lyr) {
    var split = {
      arcs: dataset.arcs,
      layers: [lyr],
      info: dataset.info
    };
    MapShaper.dissolveArcs(split);
    return split;
  });
};

// clone all layers, make a filtered copy of arcs
MapShaper.copyDataset = function(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(MapShaper.copyLayer);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
};

// clone coordinate data, shallow-copy attribute data
MapShaper.copyDatasetForExport = function(dataset) {
  var d2 = utils.extend({}, dataset);
  d2.layers = d2.layers.map(MapShaper.copyLayerShapes);
  if (d2.arcs) {
    d2.arcs = d2.arcs.getFilteredCopy();
  }
  return d2;
};

// shallow-copy layers, so they can be renamed (for export)
MapShaper.copyDatasetForRenaming = function(dataset) {
  return utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);
};

// make a stub copy if the no_replace option is given, else pass thru src layer
MapShaper.getOutputLayer = function(src, opts) {
  return opts && opts.no_replace ? {geometry_type: src.geometry_type} : src;
};

// Make a deep copy of a layer
MapShaper.copyLayer = function(lyr) {
  var copy = MapShaper.copyLayerShapes(lyr);
  if (copy.data) {
    copy.data = copy.data.clone();
  }
  return copy;
};

MapShaper.copyLayerShapes = function(lyr) {
  var copy = utils.extend({}, lyr);
    if (lyr.shapes) {
      copy.shapes = MapShaper.cloneShapes(lyr.shapes);
    }
    return copy;
};

MapShaper.getDatasetBounds = function(data) {
  var bounds = new Bounds();
  data.layers.forEach(function(lyr) {
    var lyrbb = MapShaper.getLayerBounds(lyr, data.arcs);
    if (lyrbb) bounds.mergeBounds(lyrbb);
  });
  return bounds;
};

MapShaper.datasetHasPaths = function(dataset) {
  return utils.some(dataset.layers, function(lyr) {
    return MapShaper.layerHasPaths(lyr);
  });
};

MapShaper.countMultiPartFeatures = function(shapes) {
  var count = 0;
  for (var i=0, n=shapes.length; i<n; i++) {
    if (shapes[i] && shapes[i].length > 1) count++;
  }
  return count;
};

MapShaper.getFeatureCount = function(lyr) {
  var count = 0;
  if (lyr.data) {
    count = lyr.data.size();
  } else if (lyr.shapes) {
    count = lyr.shapes.length;
  }
  return count;
};

MapShaper.getLayerBounds = function(lyr, arcs) {
  var bounds = null;
  if (lyr.geometry_type == 'point') {
    bounds = MapShaper.getPointBounds(lyr.shapes);
  } else if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
    bounds = MapShaper.getPathBounds(lyr.shapes, arcs);
  } else {
    // just return null if layer has no bounds
    // error("Layer is missing a valid geometry type");
  }
  return bounds;
};


MapShaper.getPathBounds = function(shapes, arcs) {
  var bounds = new Bounds();
  MapShaper.forEachArcId(shapes, function(id) {
    arcs.mergeArcBounds(id, bounds);
  });
  return bounds;
};

// replace cut layers in-sequence (to maintain layer indexes)
// append any additional new layers
MapShaper.replaceLayers = function(dataset, cutLayers, newLayers) {
  // modify a copy in case cutLayers == dataset.layers
  var currLayers = dataset.layers.concat();
  utils.repeat(Math.max(cutLayers.length, newLayers.length), function(i) {
    var cutLyr = cutLayers[i],
        newLyr = newLayers[i],
        idx = cutLyr ? currLayers.indexOf(cutLyr) : currLayers.length;

    if (cutLyr) {
      currLayers.splice(idx, 1);
    }
    if (newLyr) {
      currLayers.splice(idx, 0, newLyr);
    }
  });
  dataset.layers = currLayers;
};

MapShaper.isolateLayer = function(layer, dataset) {
  return utils.defaults({
    layers: dataset.layers.filter(function(lyr) {return lyr == layer;})
  }, dataset);
};

// legacy function (TODO: update tests and remove)
MapShaper.findMatchingLayers = function(layers, pattern) {
  var test = MapShaper.getTargetMatch(pattern);
  return layers.filter(function(lyr, i) {
    return test(lyr, i);
  });
};

// Transform the points in a dataset in-place; don't clean up corrupted shapes
MapShaper.transformPoints = function(dataset, f) {
  if (dataset.arcs) {
    dataset.arcs.transformPoints(f);
  }
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.transformPointsInLayer(lyr, f);
    }
  });
};

MapShaper.initDataTable = function(lyr) {
  lyr.data = new DataTable(MapShaper.getFeatureCount(lyr));
};
