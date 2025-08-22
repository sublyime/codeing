package com.chad.service;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.impl.GaussianDispersionModel;
import com.chad.service.model.impl.AlohaDispersionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class DispersionService {

    private final GaussianDispersionModel gaussianModel;
    private final AlohaDispersionModel alohaModel;
    private final WebClient weatherClient;

    @Autowired
    public DispersionService(GaussianDispersionModel gaussianModel, AlohaDispersionModel alohaModel) {
        this.gaussianModel = gaussianModel;
        this.alohaModel = alohaModel;
        this.weatherClient = WebClient.create("https://api.weather.gov");
    }

    public DispersionResult runModel(DispersionInput input) {
        if (input.getWindSpeed() == 0) {
            fetchWeather(input);
        }

        String releaseType = input.getSourceReleaseType();
        if (releaseType == null || releaseType.isEmpty()) {
            releaseType = "GAS";
        }

        switch (input.getModel().toUpperCase()) {
            case "GAUSSIAN":
                switch (releaseType.toUpperCase()) {
                    case "GAS":
                        return gaussianModel.calculateGas(input);
                    case "LIQUID":
                        return gaussianModel.calculateLiquid(input);
                    case "CHEMICAL":
                        return gaussianModel.calculateChemical(input);
                    default:
                        throw new IllegalArgumentException("Unsupported source release type: " + releaseType);
                }
            case "ALOHA":
                switch (releaseType.toUpperCase()) {
                    case "GAS":
                        return alohaModel.calculateGas(input);
                    case "LIQUID":
                        return alohaModel.calculateLiquid(input);
                    case "CHEMICAL":
                        return alohaModel.calculateChemical(input);
                    default:
                        throw new IllegalArgumentException("Unsupported source release type: " + releaseType);
                }
            default:
                throw new IllegalArgumentException("Unsupported dispersion model: " + input.getModel());
        }
    }

    private void fetchWeather(DispersionInput input) {
        try {
            String pointUrl = String.format("/points/%.6f,%.6f", input.getLatitude(), input.getLongitude());

            String response = weatherClient.get()
                    .uri(pointUrl)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // TODO: Parse response JSON to extract wind speed and direction, stability
            // class
            input.setWindSpeed(3.0);
            input.setWindDirection(270.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);
        } catch (Exception e) {
            input.setWindSpeed(1.5);
            input.setWindDirection(180.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);
        }
    }
}
