package com.chad.controller;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;
import com.chad.service.DispersionService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dispersion")
@CrossOrigin(origins = "*") // Allows frontend calls during development
public class DispersionController {

    private final DispersionService dispersionService;

    public DispersionController(DispersionService dispersionService) {
        this.dispersionService = dispersionService;
    }

    @PostMapping("/calculate")
    public DispersionResult calculateDispersion(@RequestBody DispersionInput input) {
        String releaseType = input.getSourceReleaseType();
        System.out.println("Source Release Type received: " + releaseType);

        // Example: adjust or validate input according to sourceReleaseType if needed
        if (releaseType != null) {
            switch (releaseType.toUpperCase()) {
                case "GAS":
                    // Adjust input for gas if needed
                    break;
                case "LIQUID":
                    // Adjust input for liquid if needed
                    break;
                case "CHEMICAL":
                    // Adjust input for chemical if needed
                    break;
                default:
                    // Optionally throw an error or handle unknown types
                    break;
            }
        }

        // Pass input to service method as before
        return dispersionService.runModel(input);
    }
}
