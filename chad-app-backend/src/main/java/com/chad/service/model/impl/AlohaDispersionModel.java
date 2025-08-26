package com.chad.service.model.impl;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DispersionResult calculateGas(DispersionInput input) {
        return createPlumePolygon(input, 0.03, 0.003);
    }

    public DispersionResult calculateLiquid(DispersionInput input) {
        return createPlumePolygon(input, 0.02, 0.005);
    }

    public DispersionResult calculateChemical(DispersionInput input) {
        try {
            String chemPropsJson = input.getChemicalPropertiesJson();
            if (chemPropsJson != null && !chemPropsJson.isEmpty()) {
                JsonNode props = objectMapper.readTree(chemPropsJson);
                double decayRate = props.path("decayRate").asDouble(0.0);
                double molecularWeight = props.path("molecularWeight").asDouble(0.0);

                double downwindLength = 0.025 * (1 - decayRate);
                double crosswindSpread = 0.004 * (1 + molecularWeight / 100);

                return createPlumePolygon(input, downwindLength, crosswindSpread);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
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
