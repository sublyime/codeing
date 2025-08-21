package com.chad.service.model.impl;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.DispersionModel;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.io.geojson.GeoJsonWriter;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class GaussianDispersionModel implements DispersionModel {

    private final GeometryFactory geometryFactory = new GeometryFactory();

    @Override
    public DispersionResult calculate(DispersionInput input) {
        // Simplified example: create a rough plume polygon downwind from source
        // location

        double lat = input.getLatitude();
        double lon = input.getLongitude();

        // Define dummy plume coordinates as a polygon roughly downwind (east)
        Coordinate[] coords = new Coordinate[] {
                new Coordinate(lon, lat),
                new Coordinate(lon + 0.01, lat + 0.002),
                new Coordinate(lon + 0.02, lat - 0.002),
                new Coordinate(lon, lat - 0.001),
                new Coordinate(lon, lat)
        };

        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon polygon = geometryFactory.createPolygon(ring, null);

        GeoJsonWriter writer = new GeoJsonWriter();
        String geoJson = writer.write(polygon);

        DispersionResult result = new DispersionResult();
        result.setGeoJsonPlume(geoJson);
        result.setHazardSummary(Collections.singletonMap("maxConcentration", 42.5));
        result.setConcentrationContours(Collections.emptyList());

        return result;
    }
}
