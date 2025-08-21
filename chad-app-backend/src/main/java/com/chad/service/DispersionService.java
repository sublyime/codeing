package com.chad.service;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.model.impl.GaussianDispersionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class DispersionService {

    private final GaussianDispersionModel gaussianModel;
    private final WebClient weatherClient;

    @Autowired
    public DispersionService(GaussianDispersionModel gaussianModel) {
        this.gaussianModel = gaussianModel;
        this.weatherClient = WebClient.create("https://api.weather.gov");
    }

    public DispersionResult runModel(DispersionInput input) {
        // Fetch live weather if windSpeed not set
        if (input.getWindSpeed() == 0) {
            fetchWeather(input);
        }

        // Handle sourceReleaseType to direct calculation appropriately
        String releaseType = input.getSourceReleaseType();
        if (releaseType == null || releaseType.isEmpty()) {
            releaseType = "GAS"; // Default to GAS if not specified
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

            // TODO: Parse response JSON to extract wind speed, direction, and stability
            // class
            // For now, set dummy values for demonstration:
            input.setWindSpeed(3.0);
            input.setWindDirection(270.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);

        } catch (Exception e) {
            // Fallback defaults
            input.setWindSpeed(1.5);
            input.setWindDirection(180.0);
            input.setStabilityClass(DispersionInput.StabilityClass.D);
        }
    }
}
