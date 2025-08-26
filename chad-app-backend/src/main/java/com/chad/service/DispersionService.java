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
        // Fetch weather if wind speed unknown or zero
        if (input.getWindSpeed() == 0) {
            fetchWeather(input);
        }

        String releaseType = input.getSourceReleaseType();
        if (releaseType == null || releaseType.isEmpty()) {
            releaseType = "GAS";
        }

        String modelName = input.getModel() != null ? input.getModel().toUpperCase() : "GAUSSIAN";

        switch (modelName) {
            case "GAUSSIAN":
                return handleGaussian(input, releaseType);

            case "ALOHA":
                return handleAloha(input, releaseType);

            default:
                throw new IllegalArgumentException("Unsupported dispersion model: " + modelName);
        }
    }

    private DispersionResult handleGaussian(DispersionInput input, String releaseType) {
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
    }

    private DispersionResult handleAloha(DispersionInput input, String releaseType) {
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
    }

    private void fetchWeather(DispersionInput input) {
        try {
            String pointUrl = String.format("/points/%.6f,%.6f", input.getLatitude(), input.getLongitude());

            // Fetch observation stations
            String stationListJson = weatherClient.get()
                    .uri(pointUrl)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // TODO: parse stationListJson to get stations URL, here simplified as below

            String stationsUrl = ""; // parse and fill from stationListJson

            // Fetch stations data JSON (simplified for example)
            String stationsJson = weatherClient.get()
                    .uri(stationsUrl)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // TODO: parse stationsJson to select latest station URL

            String latestStationUrl = ""; // parse and fill

            // Fetch latest observations
            String latestObsJson = weatherClient.get()
                    .uri(latestStationUrl + "/observations/latest")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            // TODO: parse latestObsJson to extract wind speed, wind direction, stability
            // class

            input.setWindSpeed(3.0); // placeholder values
            input.setWindDirection(270.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);

        } catch (Exception e) {
            // default fallback values if fetching fails
            input.setWindSpeed(1.5);
            input.setWindDirection(180.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);
        }
    }
}
