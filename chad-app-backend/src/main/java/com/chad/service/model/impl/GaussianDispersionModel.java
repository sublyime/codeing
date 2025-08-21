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
        // Default to gas calculation for compatibility
        return calculateGas(input);
    }

    public DispersionResult calculateGas(DispersionInput input) {
        // Example plume for gas release
        return createPlumePolygon(input, 0.02, 0.002);
    }

    public DispersionResult calculateLiquid(DispersionInput input) {
        // Example plume for liquid release with wider spread and shorter downwind
        // length
        return createPlumePolygon(input, 0.015, 0.004);
    }

    public DispersionResult calculateChemical(DispersionInput input) {
        // Example plume for chemical release with moderate spread and length
        return createPlumePolygon(input, 0.018, 0.003);
    }

    // Helper method to create plume polygon with given spread parameters
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
        // Set geojson plume polygon
        result.setGeoJsonPlume(geoJson);

        // Example hazard summary based on type (you can customize)
        double maxConcentration;
        switch (input.getSourceReleaseType() != null ? input.getSourceReleaseType().toUpperCase() : "GAS") {
            case "LIQUID":
                maxConcentration = 30.0;
                break;
            case "CHEMICAL":
                maxConcentration = 50.0;
                break;
            case "GAS":
            default:
                maxConcentration = 42.5;
                break;
        }

        result.setHazardSummary(Collections.singletonMap("maxConcentration", maxConcentration));
        result.setConcentrationContours(Collections.emptyList());

        return result;
    }
}
