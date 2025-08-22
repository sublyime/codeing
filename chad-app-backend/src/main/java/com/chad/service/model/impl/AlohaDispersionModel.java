package com.chad.service.model.impl;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.io.geojson.GeoJsonWriter;
import org.springframework.stereotype.Component;
import java.util.Collections;

@Component
public class AlohaDispersionModel {

    private final GeometryFactory geometryFactory = new GeometryFactory();

    public DispersionResult calculateGas(DispersionInput input) {
        return createPlumePolygon(input, 0.03, 0.003);
    }

    public DispersionResult calculateLiquid(DispersionInput input) {
        return createPlumePolygon(input, 0.02, 0.005);
    }

    public DispersionResult calculateChemical(DispersionInput input) {
        return createPlumePolygon(input, 0.025, 0.004);
    }

    private DispersionResult createPlumePolygon(DispersionInput input, double downwindLength, double crosswindSpread) {
        double lat = input.getLatitude();
        double lon = input.getLongitude();

        Coordinate[] coords = new Coordinate[] {
                new Coordinate(lon, lat),
                new Coordinate(lon + downwindLength, lat + crosswindSpread),
                new Coordinate(lon + 2 * downwindLength, lat - crosswindSpread),
                new Coordinate(lon, lat - crosswindSpread / 2),
                new Coordinate(lon, lat)
        };

        LinearRing ring = geometryFactory.createLinearRing(coords);
        Polygon polygon = geometryFactory.createPolygon(ring, null);
        GeoJsonWriter writer = new GeoJsonWriter();
        String geoJson = writer.write(polygon);

        DispersionResult result = new DispersionResult();
        result.setGeoJsonPlume(geoJson);
        result.setHazardSummary(Collections.singletonMap("maxConcentration", 55.3));
        result.setConcentrationContours(Collections.emptyList());

        return result;
    }
}
