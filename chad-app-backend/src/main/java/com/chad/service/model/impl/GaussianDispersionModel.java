package com.chad.service.model.impl;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.DispersionModel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public DispersionResult calculate(DispersionInput input) {
        // default to gas calculation
        return calculateGas(input);
    }

    public DispersionResult calculateGas(DispersionInput input) {
        return createPlumePolygon(input, 0.02, 0.002);
    }

    public DispersionResult calculateLiquid(DispersionInput input) {
        return createPlumePolygon(input, 0.015, 0.004);
    }

    public DispersionResult calculateChemical(DispersionInput input) {
        try {
            String chemPropsJson = input.getChemicalPropertiesJson();
            if (chemPropsJson != null && !chemPropsJson.isEmpty()) {
                JsonNode props = objectMapper.readTree(chemPropsJson);
                double decayRate = props.path("decayRate").asDouble(0.0);
                double molecularWeight = props.path("molecularWeight").asDouble(0.0);

                // Adjust plume size based on chemical properties (example)
                double downwindLength = 0.018 * (1 - decayRate);
                double crosswindSpread = 0.003 * (1 + molecularWeight / 100);

                return createPlumePolygon(input, downwindLength, crosswindSpread);
            }
        } catch (Exception e) {
            e.printStackTrace();
            // fallback to default parameters in case of error
        }
        return createPlumePolygon(input, 0.018, 0.003);
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
