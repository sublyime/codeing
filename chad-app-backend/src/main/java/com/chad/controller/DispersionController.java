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
        return dispersionService.runModel(input);
    }
}
